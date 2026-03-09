"use strict";

const request = require("supertest");
const axios = require("axios");
const { Pool } = require("pg");

// Real app — no mocks
const app = require("../src/app");

// Clients
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5433", 10),
  database: process.env.DB_NAME || "ecommerce",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
});

// Base URL for product-service (used to seed test products via its API)
const PRODUCT_API = `http://${process.env.PRODUCT_SERVICE_HOST || "localhost"}:3001`;

// Helpers
async function createProduct(name, price, description = "") {
  const res = await axios.post(`${PRODUCT_API}/products`, {
    name,
    price,
    description,
  });
  return res.data; // { id, name, price, ... }
}

// Schema bootstrap
beforeAll(async () => {
  // Ensure tables exist (they'll already exist if DB image ran init.sql,
  // but this guards against a bare postgres:15-alpine container)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      price       DECIMAL(10,2) NOT NULL,
      description TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id          SERIAL PRIMARY KEY,
      product_id  INTEGER NOT NULL,
      quantity    INTEGER NOT NULL DEFAULT 1,
      total_price DECIMAL(10,2) NOT NULL,
      status      VARCHAR(50) DEFAULT 'pending',
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);
});

beforeEach(async () => {
  // Orders must be deleted first (FK constraint)
  await pool.query("TRUNCATE TABLE orders RESTART IDENTITY CASCADE");
  await pool.query("TRUNCATE TABLE products RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  await pool.end();
});

// Tests

describe("GET /health", () => {
  test("returns 200 OK", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");
  });
});

describe("GET /orders — integration", () => {
  test("returns empty array when no orders exist", async () => {
    const res = await request(app).get("/orders");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("returns all orders that are in the DB", async () => {
    const product = await createProduct("Laptop", 999.99);

    // Insert two orders directly into DB
    await pool.query(
      "INSERT INTO orders (product_id, quantity, total_price, status) VALUES ($1,$2,$3,$4)",
      [product.id, 1, 999.99, "pending"],
    );
    await pool.query(
      "INSERT INTO orders (product_id, quantity, total_price, status) VALUES ($1,$2,$3,$4)",
      [product.id, 2, 1999.98, "confirmed"],
    );

    const res = await request(app).get("/orders");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe("POST /orders — integration (calls real product-service)", () => {
  test("creates an order, total_price = product.price * quantity", async () => {
    const product = await createProduct("Keyboard", 79.99);

    const res = await request(app)
      .post("/orders")
      .send({ productId: product.id, quantity: 3 });

    expect(res.status).toBe(201);
    expect(res.body.product_id).toBe(product.id);
    expect(res.body.quantity).toBe(3);
    expect(parseFloat(res.body.total_price)).toBeCloseTo(79.99 * 3, 2);
    expect(res.body.status).toBe("pending");
  });

  test("created order is persisted and retrievable via GET /orders", async () => {
    const product = await createProduct("Mouse", 29.99);

    const postRes = await request(app)
      .post("/orders")
      .send({ productId: product.id, quantity: 2 });

    expect(postRes.status).toBe(201);

    const getRes = await request(app).get("/orders");
    expect(getRes.body.some((o) => o.id === postRes.body.id)).toBe(true);
  });

  test("returns 404 when product does not exist in product-service", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ productId: 99999, quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Product not found");
  });

  test("returns 400 when productId is missing", async () => {
    const res = await request(app).post("/orders").send({ quantity: 1 });
    expect(res.status).toBe(400);
  });

  test("returns 400 when quantity is zero", async () => {
    const product = await createProduct("Headphones", 149.99);
    const res = await request(app)
      .post("/orders")
      .send({ productId: product.id, quantity: 0 });
    expect(res.status).toBe(400);
  });

  test("creating multiple orders for the same product all persist correctly", async () => {
    const product = await createProduct("Monitor", 299.99);

    await request(app)
      .post("/orders")
      .send({ productId: product.id, quantity: 1 });
    await request(app)
      .post("/orders")
      .send({ productId: product.id, quantity: 2 });
    await request(app)
      .post("/orders")
      .send({ productId: product.id, quantity: 3 });

    const res = await request(app).get("/orders");
    expect(res.body).toHaveLength(3);
    const quantities = res.body.map((o) => o.quantity).sort();
    expect(quantities).toEqual([1, 2, 3]);
  });
});

describe("PATCH /orders/:id — integration", () => {
  test("updates order status and persists to DB", async () => {
    const product = await createProduct("Webcam", 89.99);
    const createRes = await request(app)
      .post("/orders")
      .send({ productId: product.id, quantity: 1 });

    const orderId = createRes.body.id;

    const patchRes = await request(app)
      .patch(`/orders/${orderId}`)
      .send({ status: "confirmed" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("confirmed");

    // Verify in DB
    const dbRes = await pool.query("SELECT status FROM orders WHERE id = $1", [
      orderId,
    ]);
    expect(dbRes.rows[0].status).toBe("confirmed");
  });

  test("full lifecycle: pending → confirmed → shipped → delivered", async () => {
    const product = await createProduct("SSD", 119.99);
    const createRes = await request(app)
      .post("/orders")
      .send({ productId: product.id, quantity: 1 });
    const id = createRes.body.id;

    for (const status of ["confirmed", "shipped", "delivered"]) {
      const res = await request(app).patch(`/orders/${id}`).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });

  test("returns 404 for non-existent order", async () => {
    const res = await request(app)
      .patch("/orders/99999")
      .send({ status: "confirmed" });
    expect(res.status).toBe(404);
  });

  test("returns 400 for invalid status", async () => {
    const product = await createProduct("Cable", 9.99);
    const createRes = await request(app)
      .post("/orders")
      .send({ productId: product.id, quantity: 1 });

    const res = await request(app)
      .patch(`/orders/${createRes.body.id}`)
      .send({ status: "exploded" });
    expect(res.status).toBe(400);
  });
});
