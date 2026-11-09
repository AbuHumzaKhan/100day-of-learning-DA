# Orders Dataset

## Business context

This dataset represents a simplified retail order ledger used by the 100-Day Data Analyst Business Trainer.

Each row represents **one order transaction**. The dataset is designed for analyst practice rather than as a production ERP extract.

## Current size

- **Rows:** 150
- **Columns:** 12
- **Grain:** one row per order
- **Period:** January–May 2026
- **Primary key:** `order_id`

## Column dictionary

| Column | Type | Business meaning |
|---|---|---|
| `row_no` | integer | Sequential row identifier |
| `order_id` | string | Unique order reference |
| `order_date` | date | Date the order was placed |
| `customer_name` | string | Customer associated with the order |
| `category` | string | Product category |
| `product_name` | string | Product/product family sold |
| `sales` | decimal | Transaction sales value |
| `quantity` | integer | Units in the transaction |
| `discount` | decimal | Discount rate represented as a decimal |
| `profit` | decimal | Transaction profit |
| `region` | string | Sales region |
| `ship_mode` | string | Shipping method |

## Why this dataset is useful

It contains the dimensions and measures needed to practice:

- column selection
- aliases
- calculated fields
- distinct values
- sorting
- Top-N analysis
- aggregation
- HAVING filters
- business-rule filtering
- range and list filtering
- text pattern matching

The data also contains zero and negative profit values so that learners do not accidentally assume every transaction is profitable.

## Analytical grain

Do not treat this table as a customer-level or product-level summary table.

The safe interpretation is:

```text
1 row = 1 order transaction
```

Customer, category, product, region, and shipping fields are dimensions at the transaction grain.

## Core measures

Common analytical calculations include:

```text
Estimated_Cost = Sales - Profit
Profit_Margin  = Profit / Sales
Discount_Amount = Sales * Discount
```

These are derived analytical values. They do not modify the source CSV.

## Data usage

The dataset is referenced by curriculum and Coding Arena resources through:

```json
{
  "dataset_refs": ["orders"]
}
```

The application should resolve the reference through `datasets/index.json` rather than hardcoding file paths into individual learning screens.

## Validation expectations

When a learner submits an analytical query:

1. Use the correct table grain.
2. Select only requested fields.
3. Apply the required business rule.
4. Preserve requested aliases.
5. Validate calculated fields against the source columns.
6. Avoid silently introducing unrelated columns.

## Extension path

Future releases can introduce additional business tables such as:

- customers
- products
- regions
- calendar

When relationships are introduced, document the keys and relationship direction in the dataset registry and schema documentation.
