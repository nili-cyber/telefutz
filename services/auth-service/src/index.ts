import express from "express";
import authRoutes from "./routes/auth";
import phoneRoutes from "./routes/phone";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "auth-service" }));
app.use("/", authRoutes);
app.use("/", phoneRoutes);

const port = Number(process.env.PORT) || 4001;
app.listen(port, () => console.log(`auth-service listening on ${port}`));
