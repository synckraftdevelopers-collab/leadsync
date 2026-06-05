function parseQuery(query) {
  query = query.toLowerCase();

  let category = "";
  let location = "";

  // Common categories
  const categories = [
    "real estate",
    "healthcare",
    "restaurant",
    "gym",
    "salon",
    "hotel",
    "clinic",
    "construction",
    "school"
  ];

  // Common locations
  const locations = [
    "pune",
    "mumbai",
    "nagpur",
    "amravati",
    "nashik",
    "delhi",
    "bangalore"
  ];

  // Find category
  for (const cat of categories) {
    if (query.includes(cat)) {
      category = cat;
      break;
    }
  }

  // Find location
  for (const loc of locations) {
    if (query.includes(loc)) {
      location = loc;
      break;
    }
  }

  return {
    category,
    location
  };
}

module.exports = parseQuery;
