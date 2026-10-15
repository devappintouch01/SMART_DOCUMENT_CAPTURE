-- A fifth Field Kind, long_text: text that can run over several lines (notes,
-- addresses, item descriptions). Shown as a box that grows with its content.

alter table fields drop constraint if exists fields_kind_check;
alter table fields add constraint fields_kind_check
  check (kind in ('text', 'long_text', 'number', 'date', 'amount'));
