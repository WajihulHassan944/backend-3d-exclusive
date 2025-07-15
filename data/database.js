import mongoose from "mongoose";

export const connectDB = async () => {
  const connectWithRetry = async () => {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, {
        dbName: "backendapi",
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 10000, // 10s timeout for initial connection
        socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        keepAlive: true, // keep socket alive
      });
      console.log(`✅ Database connected with ${conn.connection.host}`);
    } catch (error) {
      console.error("❌ MongoDB connection failed, retrying in 5 seconds...", error);
      setTimeout(connectWithRetry, 5000); // Retry after 5 seconds
    }
  };

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️ MongoDB disconnected! Attempting to reconnect...");
    connectWithRetry();
  });

  mongoose.connection.on("error", (err) => {
    console.error("❌ MongoDB connection error:", err);
  });

  connectWithRetry();
};
