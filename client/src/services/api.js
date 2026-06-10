import axios from "axios";

// Access the environment variable injected by React build process
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://94.136.189.203:3001";

// Create configured Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15-second default timeout for standard dashboard endpoints
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json"
  }
});

// Request interceptor to handle endpoint-specific adjustments
api.interceptors.request.use(
  (config) => {
    // Lead generation triggers scraping, validation, and AI enrichment, which takes longer
    if (config.url === "/universal-leads") {
      config.timeout = 180000; // 3-minute timeout for scraping operation
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to manage errors (timeouts, network offline, 500s) centrally
api.interceptors.response.use(
  (response) => {
    // Validate response payload integrity
    if (!response.data || typeof response.data !== "object") {
      const invalidResponseError = new Error("Invalid response received from the server.");
      invalidResponseError.status = response.status;
      invalidResponseError.isInvalidResponse = true;
      return Promise.reject(invalidResponseError);
    }
    return response;
  },
  (error) => {
    let errorMessage = "An unexpected error occurred.";
    let isTimeout = false;
    let isNetworkError = false;

    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      errorMessage = "Request timed out. The operation is taking longer than expected. Please try again.";
      isTimeout = true;
    } else if (!error.response) {
      errorMessage = "Network connection failed. Please check your internet connection or verify the server is running.";
      isNetworkError = true;
    } else {
      errorMessage = error.response.data?.error || `Server error: Responded with status code ${error.response.status}.`;
    }

    // Attach details to the thrown Error object
    const enhancedError = new Error(errorMessage);
    enhancedError.originalError = error;
    enhancedError.isTimeout = isTimeout;
    enhancedError.isNetworkError = isNetworkError;
    enhancedError.status = error.response?.status;

    return Promise.reject(enhancedError);
  }
);

export default api;
