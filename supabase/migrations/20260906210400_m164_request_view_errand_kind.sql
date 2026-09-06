-- delivery_request_view gains one field: errandKind.
--
-- The tracker's "ask for this again" rebuilds a draft from this payload, and
-- without it a repeated errand came back with its type blanked — which then
-- sent the person to screen one of a form they had already filled in.
--
-- Patched in place rather than retyped. The function is long, owned by earlier
-- work, and transcribing a body by hand to add one line is how a subtle
-- difference gets introduced into something nobody re-reads. Idempotent: it
-- checks for the field first and refuses to rewrite blind if the anchor has
-- moved.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'delivery_request_view';

  if v_def is null then
    raise exception 'delivery_request_view does not exist';
  end if;

  if position('errand_kind' in v_def) > 0 then
    raise notice 'delivery_request_view already carries errand_kind';
    return;
  end if;

  v_def := replace(
    v_def,
    E'    ''cargoKind'', v_r.cargo_kind,\n',
    E'    ''cargoKind'', v_r.cargo_kind,\n    ''errandKind'', v_r.errand_kind,\n'
  );

  if position('errandKind' in v_def) = 0 then
    raise exception 'anchor not found — refusing to rewrite blind';
  end if;

  execute v_def;
end $$;
