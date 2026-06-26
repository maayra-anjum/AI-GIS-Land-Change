import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Chart from "../components/ChartTemp";
import ImageCard from "../components/ImageCard";

export default function Result() {
  const location = useLocation();
  const navigate = useNavigate();
  const { startImage, endImage, stats } = location.state || {};

  if (!startImage || !endImage || !stats) {
    navigate("/");
    return null;
  }

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "20px" }}>
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>Prediction Results</h2>

      <div
        style={{
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
          justifyContent: "center",
          marginBottom: "40px",
        }}
      >
        <ImageCard title={`Start Image`} imageUrl={startImage} />
        <ImageCard title={`End Image`} imageUrl={endImage} />
      </div>

      <div style={{ marginTop: "20px" }}>
        <h3 style={{ textAlign: "center", marginBottom: "10px" }}>Prediction Statistics</h3>
        <Chart stats={stats} />
      </div>

      <div style={{ textAlign: "center", marginTop: "30px" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "12px 24px",
            background: "#1e40af",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
}