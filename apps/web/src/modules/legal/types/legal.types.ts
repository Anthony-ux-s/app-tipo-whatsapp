export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  slug: 'terminos' | 'privacidad';
  title: string;
  intro: string;
  sections: LegalSection[];
}
