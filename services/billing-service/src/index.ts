import express from "express";
import statusRoutes from "./routes/status";
import stripeRoutes from "./routes/stripe";
import paypalRoutes from "./routes/paypal";

const app = express();

app.get("/health", (_req, res) => res.json({ status: "ok", service: "billing-service" }));

// stripeRoutes owns its own raw-body parsing on /stripe/webhook specifically
// (Stripe signs the exact raw bytes) - it must be mounted before the global
// express.json() below, or Express would consume the body as JSON first and
// signature verification would fail on every webhook call.
app.use("/", stripeRoutes);

app.use(express.json());
app.use("/", statusRoutes);
app.use("/", paypalRoutes);

const port = Number(process.env.PORT) || 4005;
app.listen(port, () => console.log(`billing-service listening on ${port}`));
