export default function Chart({ stats }) {
  if (!stats) return null;

  return (
    <div style={{ marginTop: "20px", color: "white" }}>
      <h3>📊 Stats</h3>
      {Object.entries(stats).map(([key, value]) => (
        <p key={key}>{key}: {value}</p>
      ))}
    </div>
  );
}