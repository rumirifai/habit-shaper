import app from "./app.js";

const portValue = process.env["PORT"];
const port = portValue === undefined || !Number.isInteger(Number(portValue)) ? 4000 : Number(portValue);
app.listen(port, "0.0.0.0", () => console.log(`[api] listening on :${port}`));
