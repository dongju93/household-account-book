-- 0008_category_icon.sql
-- Allow each category to store a user-chosen icon key.
-- NULL means "derive from name heuristic" (preserves behaviour for existing rows).
alter table categories
  add column icon text check (icon is null or length(icon) between 1 and 40);
