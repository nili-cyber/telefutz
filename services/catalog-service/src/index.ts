import express from "express";
import titleRoutes from "./routes/titles";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "catalog-service" }));
app.use("/", titleRoutes);

const port = Number(process.env.PORT) || 4002;
app.listen(port, () => console.log(`catalog-service listening on ${port}`));
