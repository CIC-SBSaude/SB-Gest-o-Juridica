export type DemandCatalogItem = {
  categoryCode: string;
  categoryLabel: string;
  subcategoryCode: string;
  subcategoryLabel: string;
};

export const DEMAND_CATALOG: DemandCatalogItem[] = [
  ['ASSISTENCIAL','Assistencial','CIRURGIA','Cirurgia'],
  ['ASSISTENCIAL','Assistencial','EXAME','Exame'],
  ['ASSISTENCIAL','Assistencial','INTERNACAO','Internação'],
  ['ASSISTENCIAL','Assistencial','MEDICAMENTO','Medicamento'],
  ['ASSISTENCIAL','Assistencial','TERAPIA','Terapia'],
  ['ASSISTENCIAL','Assistencial','HOME_CARE','Home Care'],
  ['ASSISTENCIAL','Assistencial','OPME','OPME'],
  ['ASSISTENCIAL','Assistencial','PROCEDIMENTO','Procedimento'],
  ['ASSISTENCIAL','Assistencial','URGENCIA_EMERGENCIA','Urgência / Emergência'],
  ['ASSISTENCIAL','Assistencial','REEMBOLSO','Reembolso'],
  ['ASSISTENCIAL','Assistencial','NEGATIVA_COBERTURA','Negativa de Cobertura'],
  ['ASSISTENCIAL','Assistencial','OUTRO_ASSISTENCIAL','Outro Assistencial'],
  ['COBRANCA','Cobrança','COBRANCA_DIVIDA','Cobrança de Dívida'],
  ['COBRANCA','Cobrança','INADIMPLENCIA','Inadimplência'],
  ['COBRANCA','Cobrança','RESSARCIMENTO','Ressarcimento'],
  ['COBRANCA','Cobrança','RECUPERACAO_CREDITO','Recuperação de Crédito'],
  ['INDENIZATORIA','Indenizatória','DANO_MORAL','Dano Moral'],
  ['INDENIZATORIA','Indenizatória','DANO_MATERIAL','Dano Material'],
  ['INDENIZATORIA','Indenizatória','DANO_MORAL_MATERIAL','Dano Moral e Material'],
  ['CONTRATUAL','Contratual','CANCELAMENTO','Cancelamento'],
  ['CONTRATUAL','Contratual','REAJUSTE','Reajuste'],
  ['CONTRATUAL','Contratual','COBERTURA_CONTRATUAL','Cobertura Contratual'],
  ['CONTRATUAL','Contratual','INCLUSAO_EXCLUSAO','Inclusão / Exclusão'],
  ['CONTRATUAL','Contratual','RESCISAO','Rescisão'],
  ['CONTRATUAL','Contratual','CARENCIA','Carência'],
  ['ADMINISTRATIVO_REGULATORIO','Administrativo / Regulatório','ANS','ANS'],
  ['ADMINISTRATIVO_REGULATORIO','Administrativo / Regulatório','PROCON','Procon'],
  ['ADMINISTRATIVO_REGULATORIO','Administrativo / Regulatório','MINISTERIO_PUBLICO','Ministério Público'],
  ['ADMINISTRATIVO_REGULATORIO','Administrativo / Regulatório','OUTRO_ORGAO','Outro Órgão'],
  ['TRABALHISTA','Trabalhista','RECLAMACAO_TRABALHISTA','Reclamação Trabalhista'],
  ['TRIBUTARIO','Tributário','TRIBUTO','Tributo'],
  ['OUTROS','Outros','NAO_CLASSIFICADO','Não Classificado'],
].map(([categoryCode,categoryLabel,subcategoryCode,subcategoryLabel]) => ({categoryCode,categoryLabel,subcategoryCode,subcategoryLabel}));

export const LEGAL_NATURES = [
  ['OBRIGACAO_FAZER','Obrigação de Fazer'],
  ['OBRIGACAO_NAO_FAZER','Obrigação de Não Fazer'],
  ['INDENIZATORIA','Indenizatória'],
  ['DECLARATORIA','Declaratória'],
  ['CONDENATORIA','Condenatória'],
  ['EXECUCAO','Execução'],
  ['CAUTELAR','Cautelar'],
  ['MANDAMENTAL','Mandamental'],
  ['OUTRA','Outra'],
].map(([code,label]) => ({code,label}));

export const demandCategories = Array.from(new Map(DEMAND_CATALOG.map(i => [i.categoryCode, {code:i.categoryCode,label:i.categoryLabel}])).values());
export const subcategoriesFor = (categoryCode: string) => DEMAND_CATALOG.filter(i => i.categoryCode===categoryCode);
export const categoryLabel = (code?: string|null) => demandCategories.find(i=>i.code===code)?.label || code?.replaceAll('_',' ') || 'Não classificado';
export const subcategoryLabel = (code?: string|null) => DEMAND_CATALOG.find(i=>i.subcategoryCode===code)?.subcategoryLabel || code?.replaceAll('_',' ') || 'Não classificado';
export const legalNatureLabel = (code: string) => LEGAL_NATURES.find(i=>i.code===code)?.label || code.replaceAll('_',' ');
