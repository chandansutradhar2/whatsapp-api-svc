const express = require("express");
const app = express();
app.use(express.json());

const apiRoutes = require("./routes/api.route");

app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Methods", "GET,POST,HEAD,OPTIONS,PUT,PATCH");
	res.header(
		"Access-Control-Allow-Headers",
		"Origin,X-Requested-With,Content-Type,Accept,token",
	);
	next();
});

app.use("/api", apiRoutes);

app.listen(4000, () => {
	console.log("server started and listening on port 4000");
});
