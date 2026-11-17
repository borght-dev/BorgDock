import { syntaxTree } from '@codemirror/language';
import { type EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { Fragment, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

function EmbeddedImage({ src, alt, onResize }: { src?: string; alt?: string; onResize(): void }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return <span className="bd-note-image-error">{alt || 'Image unavailable'}</span>;
  return (
    <img
      src={src}
      alt={alt ?? ''}
      onLoad={onResize}
      onError={() => {
        setFailed(true);
        onResize();
      }}
    />
  );
}

const mounted = new WeakMap<HTMLElement, { root: Root; observer: ResizeObserver }>();

class MarkdownWidget extends WidgetType {
  constructor(
    readonly markdown: string,
    readonly from: number,
    readonly block: boolean,
  ) {
    super();
  }

  eq(other: MarkdownWidget) {
    return (
      this.markdown === other.markdown && this.from === other.from && this.block === other.block
    );
  }

  toDOM(view: EditorView) {
    const host: HTMLElement = document.createElement(this.block ? 'div' : 'span');
    host.className = this.block ? 'bd-note-table-preview' : 'bd-note-image-preview';
    host.title = 'Click to edit Markdown';
    host.addEventListener('mousedown', (event) => {
      if (
        event.button !== 0 ||
        (event.target instanceof Element && event.target.closest('[data-note-url]'))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    });
    const measure = () => {
      if (view.dom.isConnected) view.requestMeasure();
    };
    const root = createRoot(host);
    root.render(
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <Fragment>{children}</Fragment>,
          a: ({ href, children }) => (
            <span className="bd-note-link" data-note-url={href}>
              {children}
            </span>
          ),
          img: ({ src, alt }) => (
            <EmbeddedImage
              src={typeof src === 'string' ? src : undefined}
              alt={alt}
              onResize={measure}
            />
          ),
        }}
      >
        {this.markdown}
      </ReactMarkdown>,
    );
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    mounted.set(host, { root, observer });
    return host;
  }

  destroy(dom: HTMLElement) {
    const mount = mounted.get(dom);
    mount?.observer.disconnect();
    mounted.delete(dom);
    queueMicrotask(() => mount?.root.unmount());
  }

  ignoreEvent() {
    return false;
  }
}

const focused = StateEffect.define<boolean>();

function decorations(state: EditorState, editing: boolean): DecorationSet {
  const ranges: ReturnType<Decoration['range']>[] = [];
  const tree = syntaxTree(state);
  const definitions: string[] = [];
  tree.iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'Frontmatter')
        return false;
      if (node.name === 'LinkReference')
        definitions.push(state.doc.sliceString(node.from, node.to));
    },
  });
  tree.iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'Frontmatter')
        return false;
      if (node.name !== 'Table' && node.name !== 'Image') return;
      const first = state.doc.lineAt(node.from).from;
      const last = state.doc.lineAt(node.to).to;
      const active =
        editing &&
        state.selection.ranges.some((selection) => selection.from <= last && selection.to >= first);
      if (!active) {
        let source = state.doc.sliceString(node.from, node.to);
        if (node.name === 'Table') {
          const rows: string[] = [];
          for (let row = node.node.firstChild; row; row = row.nextSibling) {
            if (['TableHeader', 'TableDelimiter', 'TableRow'].includes(row.name)) {
              rows.push(state.doc.sliceString(row.from, row.to));
            }
          }
          source = rows.join('\n');
        }
        const markdown = definitions.length ? `${source}\n\n${definitions.join('\n')}` : source;
        ranges.push(
          Decoration.replace({
            widget: new MarkdownWidget(markdown, node.from, node.name === 'Table'),
            block: node.name === 'Table',
          }).range(node.from, node.to),
        );
      }
      return false;
    },
  });
  return Decoration.set(ranges, true);
}

export function renderedMarkdown() {
  const field = StateField.define<{ focused: boolean; decorations: DecorationSet }>({
    create(state) {
      return { focused: false, decorations: decorations(state, false) };
    },
    update(value, transaction) {
      let hasFocus = value.focused;
      for (const effect of transaction.effects) if (effect.is(focused)) hasFocus = effect.value;
      if (
        !transaction.docChanged &&
        !transaction.selection &&
        hasFocus === value.focused &&
        transaction.startState.readOnly === transaction.state.readOnly &&
        syntaxTree(transaction.startState) === syntaxTree(transaction.state)
      )
        return value;
      return {
        focused: hasFocus,
        decorations: decorations(transaction.state, hasFocus && !transaction.state.readOnly),
      };
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });
  return [
    field,
    EditorView.updateListener.of((update) => {
      if (!update.focusChanged) return;
      const view = update.view;
      queueMicrotask(() => {
        if (view.dom.isConnected) view.dispatch({ effects: focused.of(view.hasFocus) });
      });
    }),
  ];
}
