create policy "anon_delete_contact_submissions" on public.contact_submissions
  for delete to public using (true);