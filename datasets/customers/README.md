# Customers Dataset

Customer master table for realistic customer segmentation and regional analysis.

- 20 customers
- Grain: one row per customer
- Primary key: `customer_id`
- Intended use: customer segmentation, regional coverage, customer-level joins, and business-rule exercises

## Relationship

`customers.customer_name` can be matched to `orders.customer_name` for training purposes. The customer master is intentionally small and deterministic so learners can validate joins and aggregations.
