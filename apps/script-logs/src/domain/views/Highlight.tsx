export default function Highlight({
  text,
  search,
}: {
  text: string;
  search: string;
}) {
  const term = search.trim().toLowerCase();
  if (!term) return <>{text}</>;
  const lower = text.toLowerCase();
  const pieces = [];
  let offset = 0;
  for (
    let index = lower.indexOf(term);
    index !== -1;
    index = lower.indexOf(term, offset)
  ) {
    pieces.push(text.slice(offset, index));
    pieces.push(
      <mark key={index} style={{ background: '#ffe3a3', color: '#142137' }}>
        {text.slice(index, index + term.length)}
      </mark>
    );
    offset = index + term.length;
  }
  pieces.push(text.slice(offset));
  return <>{pieces}</>;
}
