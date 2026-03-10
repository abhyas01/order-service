'use strict';

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ecommerce',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

const VALID_STATUSES = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
];

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/orders', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders ORDER BY created_at DESC',
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/orders', async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (
      !productId ||
      !Number.isInteger(Number(productId)) ||
      Number(productId) <= 0
    ) {
      return res.status(400).json({ error: 'Valid productId is required' });
    }
    if (
      !quantity ||
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) <= 0
    ) {
      return res
        .status(400)
        .json({ error: 'Quantity must be a positive integer' });
    }

    const productHost = process.env.PRODUCT_SERVICE_HOST || 'product-service';
    const productPort = process.env.PRODUCT_SERVICE_PORT || 3001;
    const productResponse = await axios.get(
      `http://${productHost}:${productPort}/products/${productId}`,
    );
    const product = productResponse.data;
    const totalPrice = product.price * quantity;

    const result = await pool.query(
      'INSERT INTO orders (product_id, quantity, total_price, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [productId, quantity, totalPrice, 'pending'],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.response && err.response.status === 404) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(500).json({ error: 'Error creating order' });
  }
});

app.patch('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = app;
