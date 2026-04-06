require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { expressjwt: jwt } = require("express-jwt");
const jwksRsa = require("jwks-rsa");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.OPENAI_API_KEY) {
  console.log("⚠️ No OPENAI_API_KEY (AI disabled)");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy",
});

const expensesDB = {};

// 🔐 AUTH
const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    jwksUri:
      "https://dev-zhqwjjxhme75mjyx.us.auth0.com/.well-known/jwks.json",
  }),
  audience: "https://my-api",
  issuer: "https://dev-zhqwjjxhme75mjyx.us.auth0.com/",
  algorithms: ["RS256"],
});

// ✅ TEST
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

// 📥 GET expenses
app.get("/expenses", checkJwt, (req, res) => {
  const userId = req.auth.sub;
  res.json(expensesDB[userId] || []);
});

// ➕ ADD expense
app.post("/expenses", checkJwt, (req, res) => {
  try {
    const userId = req.auth.sub;
    const { amount, category } = req.body;

    if (!amount || !category) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const newExpense = {
      id: Date.now(),
      amount: Number(amount),
      category,
    };

    if (!expensesDB[userId]) {
      expensesDB[userId] = [];
    }

    expensesDB[userId].push(newExpense);

    res.json(newExpense);
  } catch (err) {
    console.error("ADD ERROR:", err);
    res.status(500).json({ message: "Add failed" });
  }
});

// 🗑 DELETE
app.delete("/expenses/:id", checkJwt, (req, res) => {
  try {
    const userId = req.auth.sub;
    const id = Number(req.params.id);

    if (!expensesDB[userId]) {
      return res.json({ success: true });
    }

    expensesDB[userId] = expensesDB[userId].filter(
      (e) => e.id !== id
    );

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

// 💾 SAVE BUDGET (🔥 ย้ายขึ้นมา)
app.post("/budget", checkJwt, (req, res) => {
  const userId = req.auth.sub;
  const { budget } = req.body;

  if (!budget) {
    return res.status(400).json({ message: "Missing budget" });
  }

  if (!expensesDB[userId]) {
    expensesDB[userId] = [];
  }

  expensesDB[userId]._budget = Number(budget);

  res.json({ success: true });
});

// 📥 GET BUDGET
app.get("/budget", checkJwt, (req, res) => {
  const userId = req.auth.sub;

  res.json({
    budget: expensesDB[userId]?._budget || 0,
  });
});

// 🤖 AI
app.get("/ai-summary", checkJwt, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const expenses = expensesDB[userId] || [];

    if (expenses.length === 0) {
      return res.json({ message: "No expenses yet." });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        message: "AI is disabled (no API key)",
      });
    }

    const summaryText = expenses
      .map((e) => `${e.category}: ${e.amount} THB`)
      .join(", ");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Give 3 short bullet financial advice.",
        },
        {
          role: "user",
          content: `Analyze my spending: ${summaryText}`,
        },
      ],
    });

    res.json({
      message: completion.choices[0].message.content,
    });
  } catch (err) {
    console.error("AI ERROR:", err);
    res.json({ message: "AI temporarily unavailable" });
  }
});

// 🔥 GLOBAL ERROR
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      message: "Invalid token",
    });
  }

  res.status(500).json({
    message: "Server error",
  });
});

// 🚀 RUN 
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});