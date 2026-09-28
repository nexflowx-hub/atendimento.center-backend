# Atlas Platform database

Production Atlas Platform Core currently uses Supabase project `qguciygqckkbxhaboxjb`.

The initial production migration was applied on 2026-09-27/28 as:

`atlas_platform_foundation_v1`

A separate hardening migration revoked anonymous/authenticated execution of the legacy `public.rls_auto_enable()` SECURITY DEFINER function:

`harden_rls_auto_enable`

Do not apply Atlas Platform migrations to the Novidades/AutoHub commerce project, XPAYMENTS or PiXBrasil databases.

The Atlas application schemas are intentionally private/non-exposed and are accessed through the NestJS backend.
