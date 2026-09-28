-- Applied to Atlas Platform Core as migration smm_unit_pricing_v1.

alter table smm.services
  add column if not exists cost_unit_size integer not null default 1000;

alter table smm.offers
  add column if not exists pricing_model text not null default 'per_unit_size',
  add column if not exists unit_size integer not null default 1000;

alter table smm.services
  drop constraint if exists smm_services_cost_unit_size_check;
alter table smm.services
  add constraint smm_services_cost_unit_size_check check (cost_unit_size > 0);

alter table smm.offers
  drop constraint if exists smm_offers_pricing_model_check;
alter table smm.offers
  add constraint smm_offers_pricing_model_check
    check (pricing_model in ('fixed','per_unit_size'));

alter table smm.offers
  drop constraint if exists smm_offers_unit_size_check;
alter table smm.offers
  add constraint smm_offers_unit_size_check check (unit_size > 0);
