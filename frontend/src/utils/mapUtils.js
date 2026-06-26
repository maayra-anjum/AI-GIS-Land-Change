export const formatPolygon = (coords) => {
  return {
    type: "Polygon",
    coordinates: [coords],
  };
};