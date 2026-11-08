export interface FieldCard {
  id: string;
  title: string;
  norwegianName: string | null;
  points: readonly string[];
}

export const FIELD_GUIDE: readonly FieldCard[] = [
  {
    id: 'reindeer',
    title: 'Reindeer',
    norwegianName: 'Rein',
    points: [
      'Eyes turn deep blue in winter to capture UV light.',
      'Hollow, air-filled fur traps heat and keeps the animal insulated.',
      'Hooves act as scoops to dig through crusted snow (beitegrop).',
    ],
  },
  {
    id: 'ptarmigan',
    title: 'Rock Ptarmigan',
    norwegianName: 'Fjellrype',
    points: [
      'Pure white winter plumage hides the bird against snow.',
      'Feathers on the toes act as natural snowshoes.',
      'They sleep buried in snowbanks (snøhuler) and stay warm at −20°C.',
    ],
  },
  {
    id: 'fox',
    title: 'Arctic & Red Fox',
    norwegianName: 'Rev',
    points: [
      'Hearing can locate lemmings under 1 meter of snow.',
      'The brush tail wraps over the nose while sleeping.',
      'The fur has the highest thermal insulation of any mammal.',
    ],
  },
  {
    id: 'birch',
    title: 'Mountain Birch',
    norwegianName: 'Fjellbjørk',
    points: [
      'Trunks bend under tons of snow instead of snapping.',
      'Sap carries natural anti-freeze sugars.',
      'Those sugars let the tree survive sub-zero winds.',
    ],
  },
  {
    id: 'twilight',
    title: 'Polar Twilight & Blue Hour',
    norwegianName: null,
    points: [
      'In the Tromsø polar night the sun does not crest the horizon.',
      'Sunlight still scatters through ozone in the upper atmosphere.',
      'Around midday that scatter turns the sky electric pink and blue.',
    ],
  },
];
