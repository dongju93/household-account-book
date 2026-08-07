-- 0014_memo_history_search.sql
-- `fetchMemoHistory` (src/data/transactions.ts) needs to retrieve rows matching a
-- draft memo in EITHER substring direction: a stored "스타벅스" should surface when
-- the user types the refinement "스타벅스 강남점", and vice versa. The domain layer
-- (`suggestCategoriesFromMemo`) already supports either-side matching, but the data
-- layer only ever sent rows from the "stored contains new" direction — PostgREST's
-- text operators (`ilike`, `imatch`) always place the column on the left, so the
-- reverse test "new contains stored" cannot be expressed as a `.filter(...)`.
--
-- This RPC does the reverse test inside SQL, where the operands can be swapped.
-- Both directions use plain case-insensitive substring search (`strpos` on the
-- lowercased pair) rather than a regex, so stored memo text is treated as a literal
-- even when it contains regex metacharacters (no `~*` with the column as pattern,
-- which would let a stored `.*` match everything). The clamped `p_memo <> ''`
-- guard mirrors the client-side empty-memo short circuit.

create or replace function search_memo_history(p_ledger uuid, p_memo text, p_limit int default 50)
returns table(category_id uuid, memo text)
language sql
stable
as $$
  select t.category_id, t.memo
  from transactions t
  where t.ledger_id = p_ledger
    and t.memo is not null
    and t.memo <> ''
    and coalesce(p_memo, '') <> ''
    and (
      position(lower(p_memo) in lower(t.memo)) > 0   -- stored contains new
      or position(lower(t.memo)  in lower(p_memo)) > 0  -- new contains stored
    )
  order by t.txn_date desc, t.id desc
  limit greatest(p_limit, 0);
$$;

revoke all on function search_memo_history(uuid, text, int) from public;
grant execute on function search_memo_history(uuid, text, int) to authenticated;