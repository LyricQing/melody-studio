export default function Loading() {
  return (
    <main className="page-wrap" aria-busy="true" aria-label="页面加载中">
      <div style={{ minHeight: "70dvh", display: "grid", placeItems: "center" }}>
        <div className="spinner" style={{ width: 28, height: 28, color: "#f0a64b" }} />
      </div>
    </main>
  );
}