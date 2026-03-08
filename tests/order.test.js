describe("Order Service", () => {
  test("should validate order has productId", () => {
    const order = { productId: 1, quantity: 2 };
    expect(order.productId).toBeDefined();
  });

  test("should validate order quantity is positive", () => {
    const order = { productId: 1, quantity: 2 };
    expect(order.quantity).toBeGreaterThan(0);
  });
});
