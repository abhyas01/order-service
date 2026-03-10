# Order Service

REST API for order management — part of the ecommerce microservices platform.

## Tech Stack

- Node.js + Express
- PostgreSQL
- Axios (inter-service communication)

## Prerequisites

- Node.js 18+
- PostgreSQL (or use Docker Compose from root)
- Product Service running

## Setup

```bash

cd src
npm install
```

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable             | Default         | Description          |
| -------------------- | --------------- | -------------------- |
| DB_HOST              | localhost       | Database host        |
| DB_NAME              | ecommerce       | Database name        |
| DB_USER              | postgres        | Database user        |
| DB_PASSWORD          | password        | Database password    |
| PRODUCT_SERVICE_HOST | product-service | Product service host |
| PORT                 | 3002            | Service port         |

## Running Locally

```bash
npm start
```

## Running Tests

```bash
npm test
```

## API Endpoints

| Method | Path        | Description         |
| ------ | ----------- | ------------------- |
| GET    | /health     | Health check        |
| GET    | /orders     | List all orders     |
| POST   | /orders     | Create order        |
| PATCH  | /orders/:id | Update order status |
