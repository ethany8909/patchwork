// Education content. Every medical statement is paraphrased from a named source
// (listed at the bottom of each article) and phrased as general information,
// never as a diagnosis or treatment instruction.

import {
  AAD_DRY_SKIN, AAD_INDOOR, AAD_OUTDOOR, AAD_PRODUCTS, DERMNET_MI, DERMNET_PARABENS, DERMNET_SOAPS, EPA_INDOOR, NEA_SEAL,
  OPEN_METEO, type Source,
} from "./sources";

export type { Source };

export interface Article {
  id: string;
  title: string;
  summary: string;
  body: (string | { list: string[] } | { callout: string } | { figure: "tone-guide" })[];
  sources: Source[];
}

const NHS_ECZEMA = { label: "NHS: Atopic eczema", url: "https://www.nhs.uk/conditions/atopic-eczema/" };
const AAD_PSO_SOC = { label: "American Academy of Dermatology: Psoriasis in skin of color", url: "https://www.aad.org/public/diseases/psoriasis/treatment/could-have/skin-color" };
const NPF_ERYTHRO = { label: "National Psoriasis Foundation: Erythrodermic psoriasis", url: "https://www.psoriasis.org/erythrodermic-psoriasis/" };
const HOPKINS_PSA = { label: "Johns Hopkins Arthritis Center: Psoriatic arthritis", url: "https://www.hopkinsarthritis.org/arthritis-info/psoriatic-arthritis/clinical-manifestation/" };
const JAAD_PHOTO = { label: "Journal of the American Academy of Dermatology: Optimizing photographic imaging for teledermatology", url: "https://www.jaad.org/article/S0190-9622(15)00492-2/abstract" };
const SCHMITT = { label: "Schmitt et al., J Eur Acad Dermatol Venereol, 2026: agreement between dermatopathologists on eczema vs psoriasis", url: "https://doi.org/10.1111/jdv.70388" };
const FREEMAN = { label: "Freeman et al., JAMA Dermatology, 2026: Global disparities in access to dermatological care", url: "https://doi.org/10.1001/jamadermatol.2026.3112" };
const AAD_DARK_SPOTS = { label: "American Academy of Dermatology: How to fade dark spots in darker skin tones", url: "https://www.aad.org/public/everyday-care/skin-care-secrets/routine/fade-dark-spots" };
const POEM_ORIGINAL = { label: "Charman, Venn & Williams, Archives of Dermatology, 2004: The Patient-Oriented Eczema Measure", url: "https://doi.org/10.1001/archderm.140.12.1513" };
const POEM_BANDS_SRC = { label: "Charman et al., British Journal of Dermatology, 2013: POEM severity bands", url: "https://doi.org/10.1111/bjd.12590" };
const POEM_NOTTINGHAM = { label: "University of Nottingham Centre of Evidence Based Dermatology: POEM", url: "https://www.nottingham.ac.uk/research/groups/cebd/resources/poem.aspx" };

export const ARTICLES: Article[] = [
  {
    id: "urgent",
    title: "Get care now if…",
    summary: "Signs that shouldn't wait for your next appointment.",
    body: [
      { callout: "If you have trouble breathing, or your face, lips or tongue are swelling, call 911." },
      "Contact a doctor today (or urgent care) if your skin:",
      {
        list: [
          "is blistered, crusty, leaking fluid, or has spots filled with pus",
          "is painful, swollen or feels hot",
          "suddenly gets much worse or spreads quickly",
          "comes with a high temperature, or you feel generally unwell",
        ],
      },
      "Clusters of painful blisters or punched-out sores on eczema can be eczema herpeticum, a viral infection that needs to be seen the same day.",
      "With psoriasis: red or darkened skin covering most of your body, especially with peeling, chills or feeling very unwell, can be erythrodermic psoriasis. It is rare, but it is a medical emergency.",
      "Tell your doctor at your next visit about joint pain, swelling or stiffness (especially in the morning), a whole finger or toe that swells up, or pitted or crumbling nails. Psoriasis can affect the joints, and early treatment matters.",
    ],
    sources: [NHS_ECZEMA, NPF_ERYTHRO, HOPKINS_PSA],
  },
  {
    id: "why-no-ai",
    title: "Why Patchwork doesn't diagnose you",
    summary: "We built the AI first. Here's what we learned.",
    body: [
      "Before Patchwork, we spent a year building an AI that tries to tell eczema from psoriasis in photos. On patients like the ones it learned from, it looked promising.",
      "Then we tested it on a completely different group of people. For people with darker skin (Fitzpatrick types V and VI), it was no better than a coin flip: a score of 0.50, where 0.50 means guessing. For lighter skin it scored 0.71. Our own internal checks had shown no gap at all.",
      "This isn't only a problem for computers. When 14 expert dermatopathologists looked at the same skin biopsies, they agreed on eczema versus psoriasis only fairly often, and on the hardest cases barely more than chance.",
      { callout: "An app that confidently labels your rash would be wrong most often for the people who already have the hardest time getting care." },
      "So Patchwork does what a phone can do reliably: keep an accurate, private record of how your skin changes over time, and turn it into something a doctor can read in two minutes. The diagnosis stays with someone trained to make it.",
      "That record matters. Around the world there are about 2.7 dermatologists for every 100,000 people, and in low-income countries about 0.4. When you finally get an appointment, your rash may look different that day. Your log shows what happened in between.",
    ],
    sources: [SCHMITT, FREEMAN],
  },
  {
    id: "skin-tones",
    title: "How eczema can look on different skin tones",
    summary: "Redness isn't the only sign, and on darker skin it often isn't there.",
    body: [
      "Most medical pictures of eczema and psoriasis show light skin. That makes flares on brown and Black skin easier to miss, both for patients and for clinicians.",
      { figure: "tone-guide" },
      "Eczema",
      {
        list: [
          "On white skin, eczema often looks pink or red, with slightly raised patches.",
          "On brown and Black skin, affected areas can look darker brown, purple, gray or ashy, and dry. They can also look lighter than the surrounding skin.",
          "On darker skin, eczema can also show up as small bumps, especially on the trunk, arms and legs, and as thick, leathery skin where it has been scratched for a long time.",
        ],
      },
      { callout: "The most useful comparison is with your own skin: is the patch darker, lighter, grayer or rougher than the skin right next to it? That is how Patchwork asks." },
      "Psoriasis",
      {
        list: [
          "On lighter skin it tends to be red or pink with silvery-white scale.",
          "It can be salmon-colored with silvery-white scale on medium skin tones.",
          "On darker skin it often looks violet with gray scale, or dark brown and hard to see.",
          "After psoriasis clears on medium to dark skin, lighter or darker patches can remain for 3 to 12 months or longer. They are not scars and usually fade.",
        ],
      },
      { callout: "Describe how your skin feels, not just its color: itch, thickness, flaking, cracking. That's why Patchwork asks about texture before color." },
    ],
    sources: [NHS_ECZEMA, AAD_PSO_SOC],
  },
  {
    id: "poem",
    title: "Your weekly score (POEM)",
    summary: "A research-grade eczema score with no questions about redness.",
    body: [
      "POEM, the Patient-Oriented Eczema Measure, is seven questions about the past week: how many days your skin was itchy, bleeding, oozing, cracked, flaking or dry, and how many nights your sleep was disturbed. Dermatologists and researchers use it around the world.",
      "Each answer scores 0 (no days) to 4 (every day), so the total runs from 0 to 28.",
      {
        list: [
          "0–2: clear or almost clear",
          "3–7: mild",
          "8–16: moderate",
          "17–24: severe",
          "25–28: very severe",
        ],
      },
      { callout: "None of the seven questions asks about redness. That is why Patchwork uses POEM: the score means the same thing whatever your skin tone." },
      "Week-to-week changes of about 3 points or less are normal variation. A bigger change is worth noticing, and the trend is what your dermatologist will want to see.",
      "POEM was designed for eczema. If you have psoriasis, your score is still a useful record of symptoms, but it hasn't been tested for psoriasis.",
    ],
    sources: [POEM_ORIGINAL, POEM_BANDS_SRC, POEM_NOTTINGHAM],
  },
  {
    id: "dark-marks",
    title: "Dark marks after a flare",
    summary: "Why they happen, how long they last, and why tracking helps.",
    body: [
      "When eczema or psoriasis heals, it can leave a patch that is darker (or sometimes lighter) than the skin around it. Doctors call this post-inflammatory hyperpigmentation, or hypopigmentation when the patch is lighter.",
      {
        list: [
          "It is more common, and often more noticeable, on brown and Black skin.",
          "It is not a scar, and it usually fades, but that can take months to a year or more.",
          "Scratching and rubbing can make marks darker, so calming the flare itself matters most.",
          "Sun can make dark spots darker. Dermatologists often recommend daily sunscreen.",
        ],
      },
      "For many people, the marks bother them more than the flare did, but they rarely come up in a short appointment.",
      { callout: "Patchwork lets you rate each mark against the skin right around it every couple of weeks, with a photo lined up to the last one. Months of slow fading become easy to see, and easy to show your dermatologist." },
      "Ask your dermatologist before trying lightening creams or products sold for dark spots. Some can irritate eczema-prone skin.",
    ],
    sources: [AAD_DARK_SPOTS, AAD_PSO_SOC],
  },
  {
    id: "weather",
    title: "Weather and your skin",
    summary: "How dry air, heat, cold and sun affect eczema, and what Skin weather shows.",
    body: [
      "Weather changes how eczema-prone skin feels, and not the same way for everyone. Some people flare on dry winter days, others on hot, sweaty ones.",
      {
        list: [
          "Dry air: eczema that flares in winter, or in a dry climate, is often reacting to dry air. Cold air holds little water, and heating it indoors makes it drier still.",
          "Cold and wind can dry skin until it cracks.",
          "Heat and sweat: sweating and overheating are common triggers. Loose cotton clothes and breaks to cool down help.",
          "Sun: a sunburn can set off a flare. Dermatologists suggest a fragrance-free, broad-spectrum sunscreen with SPF 30 or more, using zinc oxide and/or titanium dioxide.",
        ],
      },
      { callout: "Skin weather shows the humidity outside and estimates it indoors: it takes the outdoor dew point and warms that air to 70°F (21°C), because heating makes cold air much drier. Under 30%, indoors or out, counts as very dry. The EPA suggests keeping indoor humidity between 30 and 50%." },
      "A humidifier in your bedroom can add moisture while you sleep. Clean it regularly so mold doesn't grow.",
      "If you choose a city, Patchwork also compares your itch on very dry, hot and cold days with other days, using the same test it uses for the triggers you log. It needs at least 14 logged days, and it only shows patterns that are unlikely to be chance.",
      "Skin weather sends only your chosen city's map coordinates to Open-Meteo, a free weather service. Nothing from your journal is sent.",
    ],
    sources: [AAD_OUTDOOR, AAD_INDOOR, AAD_DRY_SKIN, EPA_INDOOR, OPEN_METEO],
  },
  {
    id: "labels",
    title: "Reading ingredient labels",
    summary: "The few ingredient names worth knowing, and what the product check looks for.",
    body: [
      "Many skin reactions come from a small number of ingredients that turn up in lots of products. Knowing their names makes a label much easier to read.",
      {
        list: [
          "Fragrance-free, not unscented. \"Unscented\" products can contain a fragrance that hides other smells. Look for \"fragrance-free\".",
          "Fragrance has many names on a label: Fragrance, Parfum, and individual scent chemicals such as geraniol, citronellol, linalool and limonene.",
          "Preservatives: methylisothiazolinone (MI) and formaldehyde releasers such as DMDM hydantoin and quaternium-15 are common causes of skin allergy.",
          "Foaming cleansers: sodium lauryl sulfate is more irritating than the similar-sounding sodium laureth sulfate.",
          "Parabens have a bad reputation, but skin allergy to them is uncommon.",
        ],
      },
      { callout: "The National Eczema Association gives its Seal of Acceptance only to products without any ingredient on its Ecz-clusion List of known irritants and allergens. Patchwork's product check looks for that list, plus a few other common culprits." },
      "Patchwork reads the label photo on your phone. The photo is never uploaded or saved, and reading isn't perfect, so check that the text matches the label.",
      "No product suits everyone, and a product with nothing flagged can still bother your skin. If you think you're reacting to something, stop using it and ask your clinician about allergy testing, which can find exactly what to avoid.",
    ],
    sources: [AAD_PRODUCTS, NEA_SEAL, DERMNET_MI, DERMNET_SOAPS, DERMNET_PARABENS],
  },
  {
    id: "photos",
    title: "Taking photos your doctor can use",
    summary: "Habits that make progress photos comparable on every skin tone.",
    body: [
      {
        list: [
          "Use bright daylight from a window, and turn the flash off. Flash washes out texture and color.",
          "Face the window, so the light falls on your skin rather than coming from behind it.",
          "Tap the skin on screen before taking the photo, so the camera focuses and sets brightness on your skin and not the background. This matters most for darker skin, which cameras tend to underexpose.",
          "Take the same spot from the same distance each time. Patchwork shows a faint outline of your last photo to help you line it up.",
          "Include a little unaffected skin at the edge of the photo. Changes are easiest to judge against your own normal skin.",
          "Use a plain background, and skip lotion or makeup on the area right before the photo.",
        ],
      },
      "After each photo, Patchwork checks the lighting and puts it next to your last photo of the same area. It compares you with you, never with a \"standard\" skin color.",
      "Patchwork removes location data (GPS) and other hidden details from every photo, and stores it encrypted on your phone. It never uploads your photos.",
    ],
    sources: [JAAD_PHOTO],
  },
  {
    id: "visit",
    title: "Making the most of a short visit",
    summary: "Dermatology appointments are often 15 minutes. Here's how to use them.",
    body: [
      {
        list: [
          "Bring your Patchwork visit report, printed or on your phone, and hand it over at the start.",
          "Lead with your biggest worry. Visits run out of time before lists do.",
          "Show photos from your worst days. Skin often looks calmer on the day of the appointment.",
          "Mention everything you've tried, including store-bought creams and home remedies.",
          "Ask what to do the next time it flares, and how long to keep using each treatment.",
          "Before you leave, repeat back the plan in your own words.",
        ],
      },
    ],
    sources: [],
  },
];

export const RESEARCH_NOTE =
  "Numbers from our research paper on eczema and psoriasis image classification across skin tones (submitted to the IEEE BigData 2026 High School Symposium).";
