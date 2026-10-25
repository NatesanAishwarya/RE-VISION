/** RE:VISION, with the colon drawn as two dots like a lens focus mark. */
export default function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`wordmark ${size}`} aria-label="RE:VISION">
      <span aria-hidden="true">RE</span><span className="colon" aria-hidden="true"><i /><i /></span><span aria-hidden="true">VISION</span>
    </span>
  );
}
