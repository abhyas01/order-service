// tests/order.unit.test.js
"use strict";
const request = require("supertest");

const mockQuery = jest.fn();
jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

jest.mock("axios");
const axios = require("axios");

const app = require("../src/app");

// Mirrors exactly what Postgres returns for an orders row
const makeOrder = (overrides = {}) => ({
  id: 1,
  product_id: 1,
  quantity: 2,
  total_price: "1999.98",
  status: "pending",
  created_at: "2024-01-15T10:00:00.000Z",
  ...overrides,
});

// Mirrors what product-service returns
const makeProduct = (overrides = {}) => ({
  id: 1,
  name: "Laptop",
  price: 999.99,
  description: "High-performance laptop",
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe("GET /health", () => {
  test("returns 200 with text OK", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");
  });
});

describe("GET /orders", () => {
  test("returns 200 with all rows from DB", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeOrder({ id: 1, status: "pending" }),
        makeOrder({ id: 2, status: "confirmed" }),
        makeOrder({ id: 3, status: "shipped" }),
      ],
    });

    const res = await request(app).get("/orders");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].status).toBe("pending");
    expect(res.body[1].status).toBe("confirmed");
    expect(res.body[2].status).toBe("shipped");
  });

  test("returns 200 with empty array when no orders exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/orders");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  test("each order in response has all expected fields", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [makeOrder()] });

    const res = await request(app).get("/orders");

    const o = res.body[0];
    expect(o).toHaveProperty("id");
    expect(o).toHaveProperty("product_id");
    expect(o).toHaveProperty("quantity");
    expect(o).toHaveProperty("total_price");
    expect(o).toHaveProperty("status");
    expect(o).toHaveProperty("created_at");
  });

  test("returns 500 with error field when DB throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(app).get("/orders");

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /orders", () => {
  test("returns 201 with the created order row", async () => {
    axios.get.mockResolvedValueOnce({ data: makeProduct({ price: 999.99 }) });
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeOrder({
          id: 7,
          product_id: 1,
          quantity: 2,
          total_price: "1999.98",
          status: "pending",
        }),
      ],
    });

    const res = await request(app)
      .post("/orders")
      .send({ productId: 1, quantity: 2 });

    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.id).toBe(7);
    expect(res.body.product_id).toBe(1);
    expect(res.body.quantity).toBe(2);
    expect(res.body.total_price).toBe("1999.98");
    expect(res.body.status).toBe("pending");
    expect(res.body).toHaveProperty("created_at");
  });

  test("calls product-service with the correct URL", async () => {
    axios.get.mockResolvedValueOnce({ data: makeProduct() });
    mockQuery.mockResolvedValueOnce({ rows: [makeOrder()] });

    await request(app).post("/orders").send({ productId: 3, quantity: 1 });

    expect(axios.get).toHaveBeenCalledTimes(1);
    const calledUrl = axios.get.mock.calls[0][0];
    expect(calledUrl).toMatch(/\/products\/3$/);
  });

  test("inserts correct productId, quantity, totalPrice, status into DB", async () => {
    axios.get.mockResolvedValueOnce({ data: makeProduct({ price: 49.99 }) });
    mockQuery.mockResolvedValueOnce({ rows: [makeOrder()] });

    await request(app).post("/orders").send({ productId: 5, quantity: 3 });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const args = mockQuery.mock.calls[0][1];
    expect(args[0]).toBe(5); // productId
    expect(args[1]).toBe(3); // quantity
    expect(args[2]).toBeCloseTo(149.97, 2); // 49.99 * 3
    expect(args[3]).toBe("pending"); // status always starts as pending
  });

  test("calculates total_price as product.price * quantity", async () => {
    axios.get.mockResolvedValueOnce({ data: makeProduct({ price: 25.0 }) });
    mockQuery.mockResolvedValueOnce({ rows: [makeOrder()] });

    await request(app).post("/orders").send({ productId: 1, quantity: 4 });

    const args = mockQuery.mock.calls[0][1];
    expect(args[2]).toBeCloseTo(100.0, 2);
  });

  test("new order always has status pending regardless of request body", async () => {
    axios.get.mockResolvedValueOnce({ data: makeProduct() });
    mockQuery.mockResolvedValueOnce({
      rows: [makeOrder({ status: "pending" })],
    });

    const res = await request(app)
      .post("/orders")
      .send({ productId: 1, quantity: 1 });

    expect(res.status).toBe(201);
    const insertedStatus = mockQuery.mock.calls[0][1][3];
    expect(insertedStatus).toBe("pending");
  });

  test("returns 404 when product-service returns 404", async () => {
    const err = new Error("Not found");
    err.response = { status: 404 };
    axios.get.mockRejectedValueOnce(err);

    const res = await request(app)
      .post("/orders")
      .send({ productId: 999, quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Product not found");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 500 when product-service is unreachable (no response object)", async () => {
    axios.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const res = await request(app)
      .post("/orders")
      .send({ productId: 1, quantity: 1 });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 500 when DB throws after product lookup succeeds", async () => {
    axios.get.mockResolvedValueOnce({ data: makeProduct() });
    mockQuery.mockRejectedValueOnce(new Error("insert failed"));

    const res = await request(app)
      .post("/orders")
      .send({ productId: 1, quantity: 1 });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
  });

  test("returns 400 when productId is missing — does not call product-service or DB", async () => {
    const res = await request(app).post("/orders").send({ quantity: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/productId/i);
    expect(axios.get).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 when productId is zero — does not call product-service or DB", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ productId: 0, quantity: 1 });

    expect(res.status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 when productId is negative — does not call product-service or DB", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ productId: -5, quantity: 1 });

    expect(res.status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 when productId is a float — does not call product-service or DB", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ productId: 1.5, quantity: 1 });

    expect(res.status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 when quantity is missing — does not call product-service or DB", async () => {
    const res = await request(app).post("/orders").send({ productId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity/i);
    expect(axios.get).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 when quantity is zero — does not call product-service or DB", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ productId: 1, quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity/i);
    expect(axios.get).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 when quantity is negative — does not call product-service or DB", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ productId: 1, quantity: -3 });

    expect(res.status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 when quantity is a float — does not call product-service or DB", async () => {
    const res = await request(app)
      .post("/orders")
      .send({ productId: 1, quantity: 1.5 });

    expect(res.status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("PATCH /orders/:id", () => {
  test("returns 200 with the updated order", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeOrder({ id: 1, status: "confirmed" })],
    });

    const res = await request(app)
      .patch("/orders/1")
      .send({ status: "confirmed" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.id).toBe(1);
    expect(res.body.status).toBe("confirmed");
  });

  test("passes new status and order id to DB query", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeOrder({ id: 7, status: "shipped" })],
    });

    await request(app).patch("/orders/7").send({ status: "shipped" });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const args = mockQuery.mock.calls[0][1];
    expect(args[0]).toBe("shipped");
    expect(args[1]).toBe("7");
  });

  test("accepts all five valid status values", async () => {
    const validStatuses = [
      "pending",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
    ];

    for (const status of validStatuses) {
      mockQuery.mockResolvedValueOnce({ rows: [makeOrder({ status })] });

      const res = await request(app).patch("/orders/1").send({ status });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });

  test("returns 404 when order does not exist in DB", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/orders/999")
      .send({ status: "confirmed" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Order not found");
  });

  test("returns 400 when status is missing — does not query DB", async () => {
    const res = await request(app).patch("/orders/1").send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns 400 when status is an invalid value — does not query DB", async () => {
    const res = await request(app)
      .patch("/orders/1")
      .send({ status: "exploded" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("error message for invalid status lists the valid options", async () => {
    const res = await request(app)
      .patch("/orders/1")
      .send({ status: "unknown" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending/);
    expect(res.body.error).toMatch(/confirmed/);
    expect(res.body.error).toMatch(/cancelled/);
  });

  test("returns 500 with error field when DB throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("deadlock detected"));

    const res = await request(app)
      .patch("/orders/1")
      .send({ status: "confirmed" });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
  });
});
