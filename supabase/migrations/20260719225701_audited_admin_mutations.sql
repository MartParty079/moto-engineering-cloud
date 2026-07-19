create or replace function public.admin_update_feature_flag(target_feature_id uuid, changes jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare old_row public.feature_flags%rowtype;new_row public.feature_flags%rowtype;allowed_keys text[]:=array['enabled','release_stage','minimum_role'];bad_key text;
begin
 if not private.is_admin_aal2(900) then raise exception 'Recent MFA verification required'; end if;
 select key into bad_key from jsonb_object_keys(coalesce(changes,'{}'::jsonb)) key where not(key=any(allowed_keys)) limit 1;
 if bad_key is not null then raise exception 'Unsupported feature change'; end if;
 select * into old_row from public.feature_flags where id=target_feature_id for update;if not found then raise exception 'Feature not found'; end if;
 update public.feature_flags set
  enabled=case when changes?'enabled' then (changes->>'enabled')::boolean else enabled end,
  release_stage=case when changes?'release_stage' then changes->>'release_stage' else release_stage end,
  minimum_role=case when changes?'minimum_role' then (changes->>'minimum_role')::public.app_role else minimum_role end,
  updated_at=now()
 where id=target_feature_id returning * into new_row;
 insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'feature_flag_updated','feature_flag',target_feature_id::text,jsonb_build_object('before',to_jsonb(old_row),'after',to_jsonb(new_row)));
end $$;
revoke all on function public.admin_update_feature_flag(uuid,jsonb) from public,anon;
grant execute on function public.admin_update_feature_flag(uuid,jsonb) to authenticated;

create or replace function public.admin_set_feature_grant(target_user_id uuid,target_feature_id uuid,is_enabled boolean)
returns void language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare before_row public.user_feature_access%rowtype;after_row public.user_feature_access%rowtype;
begin
 if not private.is_admin_aal2(900) then raise exception 'Recent MFA verification required'; end if;
 select * into before_row from public.user_feature_access where user_id=target_user_id and feature_id=target_feature_id;
 insert into public.user_feature_access(user_id,feature_id,enabled,granted_by) values(target_user_id,target_feature_id,is_enabled,auth.uid())
 on conflict(user_id,feature_id) do update set enabled=excluded.enabled,granted_by=auth.uid(),updated_at=now()
 returning * into after_row;
 insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'feature_grant_updated','user_feature_access',concat(target_user_id,':',target_feature_id),jsonb_build_object('before',to_jsonb(before_row),'after',to_jsonb(after_row)));
end $$;
revoke all on function public.admin_set_feature_grant(uuid,uuid,boolean) from public,anon;
grant execute on function public.admin_set_feature_grant(uuid,uuid,boolean) to authenticated;

revoke update,insert,delete on public.feature_flags from authenticated;
revoke update,insert,delete on public.user_feature_access from authenticated;
