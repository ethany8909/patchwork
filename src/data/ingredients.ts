// Ingredients that often irritate eczema-prone skin or cause skin allergy.
//
// Tier "nea": on the National Eczema Association's Ecz-clusion List (ingredients a product
// must not contain to earn its Seal of Acceptance), plus closely related names.
// Tier "some": well-known irritants or allergens that bother some people, from the AAD and
// DermNet. Terms are written as they appear on labels (INCI names), in lower case.
// This is general information to bring to a clinician, not a list of "safe" and "unsafe".

import {
  AAD_DRY_SKIN, AAD_PRODUCTS, DERMNET_BASELINE, DERMNET_CAPB, DERMNET_FRAGRANCE, DERMNET_LIMONENE, DERMNET_MI, DERMNET_Q15,
  DERMNET_SOAPS, NEA_SEAL, type Source,
} from "./sources";

export interface IngredientGroup {
  id: string;
  name: string;
  tier: "nea" | "some";
  /** Label names to look for. Multi-word terms match across OCR line breaks. */
  terms: string[];
  /** Ingredient-list entries that count only when they stand alone (e.g. plain "Alcohol"). */
  wholeEntries?: string[];
  why: string;
  sources: Source[];
}

export const INGREDIENT_GROUPS: IngredientGroup[] = [
  {
    id: "fragrance",
    name: "Fragrance",
    tier: "nea",
    terms: ["fragrance", "parfum", "perfume", "masking fragrance"],
    why: "Fragrance can make eczema flare and is one of the most common causes of skin allergy. Dermatologists suggest products labeled \"fragrance-free\".",
    sources: [AAD_PRODUCTS, NEA_SEAL],
  },
  {
    id: "fragrance-chemicals",
    name: "Fragrance chemicals and balsams",
    tier: "nea",
    terms: [
      "amyl cinnamal", "amylcinnamaldehyde", "amyl cinnamic aldehyde", "amylcinnamyl alcohol", "alpha amyl cinnamic alcohol",
      "cinnamal", "cinnamic aldehyde", "cinnamaldehyde", "cinnamyl alcohol", "cinnamic alcohol",
      "hexyl cinnamal", "hexyl cinnamic aldehyde", "citral", "citronellol", "coumarin", "eugenol", "isoeugenol",
      "farnesol", "geraniol", "hydroxycitronellal", "lyral", "hydroxyisohexyl 3 cyclohexene carboxaldehyde",
      "evernia prunastri", "oak moss", "oakmoss", "myroxylon pereirae", "balsam of peru", "myroxylon balsamum", "balsam of tolu",
    ],
    why: "Scent chemicals and plant balsams that are well-known causes of skin allergy, even in products that don't smell strongly.",
    sources: [NEA_SEAL, DERMNET_FRAGRANCE],
  },
  {
    id: "citrus",
    name: "Citrus peel extracts and oils",
    tier: "nea",
    terms: ["citrus aurantifolia", "citrus aurantium dulcis", "citrus sinensis peel", "citrus limon", "citrus extract", "lime peel", "lemon peel", "orange peel"],
    why: "Citrus peel oils and powders contain scent chemicals that can irritate or cause allergy.",
    sources: [NEA_SEAL],
  },
  {
    id: "isothiazolinones",
    name: "Isothiazolinone preservatives",
    tier: "nea",
    terms: ["methylisothiazolinone", "methylchloroisothiazolinone", "benzisothiazolinone", "octylisothiazolinone", "isothiazolinone"],
    why: "Methylisothiazolinone (MI) caused a wave of skin allergy, often from shampoos and wipes. People allergic to it are advised to avoid this whole family.",
    sources: [NEA_SEAL, DERMNET_MI],
  },
  {
    id: "formaldehyde",
    name: "Formaldehyde and formaldehyde releasers",
    tier: "nea",
    terms: [
      "formaldehyde", "formalin", "dmdm hydantoin", "imidazolidinyl urea", "diazolidinyl urea", "quaternium 15", "bronopol",
      "2 bromo 2 nitropropane 1 3 diol", "sodium hydroxymethylglycinate", "methenamine", "polyoxymethylene urea",
    ],
    why: "Preservatives that slowly release formaldehyde, a common skin allergen.",
    sources: [NEA_SEAL, DERMNET_Q15],
  },
  {
    id: "preservatives-other",
    name: "Other preservatives on the avoid list",
    tier: "nea",
    terms: ["methyldibromo glutaronitrile", "methyl dibromo glutaronitrile", "triclosan"],
    why: "Preservatives and antibacterials known to cause skin allergy.",
    sources: [NEA_SEAL],
  },
  {
    id: "medicines",
    name: "Antibiotic or numbing ingredients",
    tier: "nea",
    terms: ["bacitracin", "neomycin", "polymyxin", "benzocaine", "lidocaine"],
    why: "Common in first-aid and anti-itch creams, and common causes of skin allergy. Ask a clinician before using them on eczema.",
    sources: [NEA_SEAL],
  },
  {
    id: "resins",
    name: "Propolis or shellac",
    tier: "nea",
    terms: ["propolis", "shellac"],
    why: "Bee propolis and shellac are natural resins that can cause skin allergy.",
    sources: [NEA_SEAL],
  },
  {
    id: "limonene-linalool",
    name: "Limonene or linalool",
    tier: "some",
    terms: ["limonene", "linalool"],
    why: "Scent chemicals from citrus and flowers. Exposed to air they turn into stronger allergens, so an older, opened bottle can bother skin more than a new one.",
    sources: [DERMNET_LIMONENE],
  },
  {
    id: "sls",
    name: "Sodium lauryl sulfate",
    tier: "some",
    terms: ["sodium lauryl sulfate", "sodium lauryl sulphate", "sodium dodecyl sulfate", "ammonium lauryl sulfate"],
    why: "A strong foaming cleanser that strips the skin's oils. It is more irritating than the similar-sounding sodium laureth sulfate.",
    sources: [DERMNET_SOAPS],
  },
  {
    id: "capb",
    name: "Cocamidopropyl betaine",
    tier: "some",
    terms: ["cocamidopropyl betaine"],
    why: "A foaming ingredient made from coconut oil, found in many shampoos and cleansers. Some people are allergic to it.",
    sources: [DERMNET_CAPB],
  },
  {
    id: "lanolin",
    name: "Lanolin (wool wax)",
    tier: "some",
    terms: ["lanolin", "lanolin alcohol", "wool alcohol", "wool alcohols", "wool wax", "adeps lanae"],
    why: "A good moisturizer, but some people are allergic to it. It is part of standard skin allergy (patch) tests.",
    sources: [DERMNET_BASELINE],
  },
  {
    id: "propylene-glycol",
    name: "Propylene glycol",
    tier: "some",
    terms: ["propylene glycol"],
    why: "Can sting broken skin, and some people are allergic to it. It is part of standard skin allergy (patch) tests.",
    sources: [DERMNET_BASELINE],
  },
  {
    id: "alcohol",
    name: "Drying alcohol",
    tier: "some",
    terms: ["alcohol denat", "denatured alcohol", "sd alcohol", "isopropyl alcohol", "ethyl alcohol", "ethanol"],
    wholeEntries: ["alcohol"],
    why: "Can sting cracked skin and dry it out. Fatty alcohols such as cetyl, cetearyl and stearyl alcohol are different and usually fine.",
    sources: [AAD_DRY_SKIN],
  },
];
