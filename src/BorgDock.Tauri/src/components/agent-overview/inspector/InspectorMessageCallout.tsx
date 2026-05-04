export function InspectorMessageCallout({ text }: { text: string }) {
  return (
    <div className="inspector-callout" title={text}>
      <div className="inspector-callout__label">Your last message</div>
      <div className="inspector-callout__body">{text}</div>
    </div>
  );
}
