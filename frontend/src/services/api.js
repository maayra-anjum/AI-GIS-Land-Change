const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const fetchImages = async (polygon, startYear, endYear) => {
  const res = await fetch(`${BASE_URL}/fetch-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      polygon,
      start_year: startYear,
      end_year: endYear,
    }),
  });

  return res.json();
};