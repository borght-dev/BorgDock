// File Palette (Ctrl+F8) + File Viewer (Enter)

const FilePalette = () => {
  const [q, setQ] = React.useState("QuoteFooter");
  const [mode, setMode] = React.useState("name"); // name, content, symbol
  return (
    <div className="bd-window" style={{ width: 1080, height: 680 }}>
      <div className="bd-titlebar" style={{ height: 34 }}>
        <Icons.File size={14} style={{ color: "var(--color-accent)" }} />
        <span className="bd-titlebar__title" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>File Palette</span>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Ctrl+F8</span>
        <span className="bd-titlebar__spacer" />
        <button className="bd-icon-btn"><Icons.StarFill size={13} /></button>
        <button className="bd-icon-btn"><Icons.Sidebar size={13} /></button>
        <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
      </div>

      {/* Search with mode hint */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--color-subtle-border)", display: "flex", gap: 8, alignItems: "center" }}>
        <div className="bd-input" style={{ height: 32, flex: 1 }}>
          <Icons.Search size={14} style={{ color: "var(--color-text-muted)" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Type a filename…  >text to search content  @symbol for implementations" />
          <span style={{ display: "flex", gap: 6 }}>
            <Kbd>↑↓</Kbd><Kbd>↵</Kbd><Kbd>F12</Kbd>
          </span>
        </div>
      </div>

      {/* Mode chips */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-subtle-border)", display: "flex", gap: 6, background: "var(--color-surface)" }}>
        <Chip active={mode === "name"} onClick={() => setMode("name")} count={24}>Filenames</Chip>
        <Chip active={mode === "content"} onClick={() => setMode("content")} count={127}>Content <span className="bd-mono" style={{ fontSize: 10 }}>{">"}</span></Chip>
        <Chip active={mode === "symbol"} onClick={() => setMode("symbol")} count={6}>Symbols <span className="bd-mono" style={{ fontSize: 10 }}>@</span></Chip>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", alignSelf: "center" }}>Searched 3 roots · 42k files · 140ms</span>
      </div>

      {/* Three-pane: roots / results / preview */}
      <div style={{ display: "grid", gridTemplateColumns: "180px 340px 1fr", flex: 1, minHeight: 0 }}>
        {/* Roots */}
        <div style={{ borderRight: "1px solid var(--color-subtle-border)", padding: "10px 0", background: "var(--color-surface)", overflow: "auto" }}>
          <div style={{ padding: "4px 14px 6px" }} className="bd-section-label">Roots</div>
          {[
            { name: "FSP", path: "D:/FSP", active: true, count: "11k" },
            { name: "FSP-Horizon", path: "D:/FSP-Horizon", active: false, count: "18k" },
            { name: "worktree4", path: "D:/FSP-Horizon/.worktrees", active: false, count: "18k", star: true },
            { name: "worktree2", path: "D:/FSP-Horizon/.worktrees", active: false, count: "18k", star: true },
          ].map(r => (
            <div key={r.name} style={{
              padding: "8px 14px",
              background: r.active ? "var(--color-selected-row-bg)" : "transparent",
              borderLeft: r.active ? "2px solid var(--color-accent)" : "2px solid transparent",
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            }}>
              {r.star ? <Icons.StarFill size={12} style={{ color: "var(--color-accent)" }} /> : <Icons.Folder size={12} style={{ color: "var(--color-text-muted)" }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="bd-mono" style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>{r.name}</div>
                <div className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{r.count} files</div>
              </div>
            </div>
          ))}
        </div>

        {/* Results */}
        <div className="bd-scroll" style={{ borderRight: "1px solid var(--color-subtle-border)", overflow: "auto", background: "var(--color-surface)" }}>
          {[
            { path: "src/Portal/Quote/Footer/QuoteFooter.tsx", match: "QuoteFooter", selected: true },
            { path: "src/Portal/Quote/Footer/QuoteFooter.module.css", match: "QuoteFooter" },
            { path: "src/Portal/Quote/Footer/QuoteFooter.test.tsx", match: "QuoteFooter" },
            { path: "src/Portal/Quote/Footer/PricingAdjustedActions.tsx", match: "Adjusted" },
            { path: "src/Portal/Quote/hooks/useQuoteFooter.ts", match: "QuoteFooter" },
          ].map((r, i) => (
            <div key={i} style={{
              padding: "9px 12px",
              background: r.selected ? "var(--color-selected-row-bg)" : "transparent",
              borderLeft: r.selected ? "2px solid var(--color-accent)" : "2px solid transparent",
              borderBottom: "1px solid var(--color-subtle-border)",
              cursor: "pointer",
            }}>
              <div className="bd-mono" style={{ fontSize: 12, color: "var(--color-text-primary)" }}>
                {highlight(r.path, r.match)}
              </div>
            </div>
          ))}
        </div>

        {/* Preview */}
        <div style={{ display: "flex", flexDirection: "column", background: "var(--color-background)" }}>
          <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--color-subtle-border)", display: "flex", alignItems: "center", gap: 10, background: "var(--color-surface)" }}>
            <Icons.File size={13} />
            <span className="bd-mono" style={{ fontSize: 12, color: "var(--color-text-primary)" }}>src/Portal/Quote/Footer/QuoteFooter.tsx</span>
            <span style={{ flex: 1 }} />
            <button className="bd-icon-btn"><Icons.Copy size={12} /></button>
            <button className="bd-btn bd-btn--sm"><Icons.External size={11} /> Open (↵)</button>
          </div>
          <div className="bd-scroll" style={{ flex: 1, overflow: "auto" }}>
            <CodeSample />
          </div>
        </div>
      </div>

      <div className="bd-statusbar">
        <span>42,104 indexed · .gitignore respected · symbol index fresh</span>
        <span><Kbd>↑↓</Kbd> nav · <Kbd>↵</Kbd> open · <Kbd>F12</Kbd> go to impl · <Kbd>Esc</Kbd></span>
      </div>
    </div>
  );
};

function highlight(text, match) {
  if (!match) return text;
  const idx = text.toLowerCase().indexOf(match.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      <span style={{ color: "var(--color-text-tertiary)" }}>{text.slice(0, idx)}</span>
      <mark style={{ background: "var(--color-accent-subtle)", color: "var(--color-accent)", padding: "0 1px", borderRadius: 2 }}>{text.slice(idx, idx + match.length)}</mark>
      <span style={{ color: "var(--color-text-tertiary)" }}>{text.slice(idx + match.length)}</span>
    </>
  );
}

// Code sample with tree-sitter-style highlighting using syntax tokens
const CodeSample = () => {
  const lines = [
    { n: 1,  c: <><K>import</K> <V>React</V>, {'{'} <V>useMemo</V> {'}'} <K>from</K> <S>"react"</S>;</> },
    { n: 2,  c: <><K>import</K> {'{'} <V>PricingAdjustedActions</V> {'}'} <K>from</K> <S>"./PricingAdjustedActions"</S>;</> },
    { n: 3,  c: <><K>import</K> {'{'} <V>useQuoteFooter</V> {'}'} <K>from</K> <S>"../hooks/useQuoteFooter"</S>;</> },
    { n: 4,  c: "" },
    { n: 5,  c: <><Cm>// AB#54482 — resolve Pricing Adjusted via BaseQuoteStatusType_Id (not enum field)</Cm></> },
    { n: 6,  c: <><K>export function</K> <F>QuoteFooter</F>({'{'} <P>quote</P>, <P>onAction</P> {'}'}: <T>QuoteFooterProps</T>) {'{'}</> },
    { n: 7,  c: <>  <K>const</K> <V>isPricingAdjusted</V> = <F>useMemo</F>(</> },
    { n: 8,  c: <>    () {'=>'} <V>quote</V>.<Pr>BaseQuoteStatusType_Id</Pr> <Op>===</Op> <Nm>3</Nm>,</> },
    { n: 9,  c: <>    [<V>quote</V>]</> },
    { n: 10, c: <>  );</> },
    { n: 11, c: "" },
    { n: 12, c: <>  <K>return</K> (</> },
    { n: 13, c: <>    <Op>&lt;</Op><Tg>footer</Tg> <At>className</At>={'{'}<V>styles</V>.<Pr>footer</Pr>{'}'}<Op>&gt;</Op></> },
    { n: 14, c: <>      {'{'}<V>isPricingAdjusted</V> <Op>&amp;&amp;</Op> <Op>&lt;</Op><V>PricingAdjustedActions</V> <At>onAction</At>={'{'}<V>onAction</V>{'}'} <Op>/&gt;</Op>{'}'}</> },
    { n: 15, c: <>    <Op>&lt;/</Op><Tg>footer</Tg><Op>&gt;</Op></> },
    { n: 16, c: <>  );</> },
    { n: 17, c: <>{'}'}</> },
  ];
  return (
    <pre className="bd-mono" style={{
      margin: 0, padding: "14px 0", fontSize: 12, lineHeight: 1.55,
      fontFamily: "var(--font-code)",
      color: "var(--color-text-primary)",
    }}>
      {lines.map(l => (
        <div key={l.n} style={{ display: "flex", gap: 16, padding: "0 18px", minHeight: 19 }}>
          <span style={{ width: 22, textAlign: "right", color: "var(--color-text-faint)", flexShrink: 0, userSelect: "none" }}>{l.n}</span>
          <span style={{ whiteSpace: "pre" }}>{l.c}</span>
        </div>
      ))}
    </pre>
  );
};

// Syntax token helpers
const K  = ({ children }) => <span style={{ color: "var(--color-syntax-keyword, #6655d4)" }}>{children}</span>;
const S  = ({ children }) => <span style={{ color: "var(--color-syntax-string, #3ba68e)" }}>{children}</span>;
const Cm = ({ children }) => <span style={{ color: "var(--color-syntax-comment, #8a85a0)", fontStyle: "italic" }}>{children}</span>;
const Nm = ({ children }) => <span style={{ color: "var(--color-syntax-number, #b07d09)" }}>{children}</span>;
const T  = ({ children }) => <span style={{ color: "var(--color-syntax-type, #c7324f)" }}>{children}</span>;
const F  = ({ children }) => <span style={{ color: "var(--color-text-secondary)" }}>{children}</span>;
const V  = ({ children }) => <span style={{ color: "var(--color-text-primary)" }}>{children}</span>;
const Op = ({ children }) => <span style={{ color: "var(--color-text-tertiary)" }}>{children}</span>;
const Pr = ({ children }) => <span style={{ color: "var(--color-text-secondary)" }}>{children}</span>;
const P  = ({ children }) => <span style={{ color: "var(--color-text-primary)" }}>{children}</span>;
const Tg = ({ children }) => <span style={{ color: "var(--color-syntax-type, #c7324f)" }}>{children}</span>;
const At = ({ children }) => <span style={{ color: "var(--color-syntax-number, #b07d09)" }}>{children}</span>;

const FileViewer = () => (
  <div className="bd-window" style={{ width: 860, height: 620 }}>
    <div className="bd-titlebar">
      <Icons.File size={14} style={{ color: "var(--color-accent)" }} />
      <span className="bd-titlebar__title" style={{ fontSize: 12 }}>QuoteFooter.tsx</span>
      <span className="bd-mono" style={{ fontSize: 10, color: "var(--color-text-muted)" }}>src/Portal/Quote/Footer</span>
      <span className="bd-titlebar__spacer" />
      <button className="bd-icon-btn"><Icons.Copy size={13} /></button>
      <button className="bd-icon-btn"><Icons.External size={13} /></button>
      <span style={{ width: 4 }} />
      <button className="bd-wc"><Icons.Minus size={14} /></button>
      <button className="bd-wc"><Icons.Maximize size={12} /></button>
      <button className="bd-wc bd-wc--close"><Icons.X size={14} /></button>
    </div>
    <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--color-subtle-border)", display: "flex", alignItems: "center", gap: 10, background: "var(--color-surface)" }}>
      <Pill tone="neutral">tsx</Pill>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>17 lines · 534 bytes · UTF-8</span>
      <span style={{ flex: 1 }} />
      <div style={{ width: 200 }}>
        <div className="bd-input" style={{ height: 24 }}>
          <Icons.Search size={11} />
          <input placeholder="Find in file…" />
        </div>
      </div>
      <span className="bd-kbd">F12</span>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>go to impl</span>
    </div>
    <div className="bd-scroll" style={{ flex: 1, overflow: "auto", background: "var(--color-background)" }}>
      <CodeSample />
    </div>
  </div>
);

Object.assign(window, { FilePalette, FileViewer });
