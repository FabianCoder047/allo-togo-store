export type CatalogKind = 'gps' | 'drink'

export interface CatalogItem {
  id: number
  kind: CatalogKind
  name: string
  tag: string
  desc: string
  price: number
  img: string
  specs?: {
    idealFor: string
    installation: string
    power: string
    connectivity: string
    tracking: string
    alerts: string
    sim: string
    warranty: string
  }
}

export interface ServiceItem {
  id: number
  title: string
  desc: string
  icon: 'spark' | 'headset' | 'building' | 'truck'
  tone: 'orange' | 'blue' | 'green' | 'yellow'
  audience: string
}

export const demoProducts: CatalogItem[] = [
  { id: 1, kind: 'gps', name: 'Traceur GPS Compact', tag: 'Véhicule personnel', desc: 'Un format discret pour suivre votre véhicule au quotidien.', price: 35000, img: 'https://images.unsplash.com/photo-1708063784256-5db1d134fa70?auto=format&fit=crop&w=900&q=85', specs: { idealFor: 'Voiture personnelle', installation: 'Discrète — méthode à confirmer', power: 'Alimentation à confirmer', connectivity: 'Réseau mobile à confirmer', tracking: 'Position et historique selon configuration', alerts: 'Options à confirmer', sim: 'Conditions SIM à confirmer', warranty: 'Durée à confirmer' } },
  { id: 2, kind: 'gps', name: 'Traceur GPS Pro', tag: 'Usage professionnel', desc: 'Pensé pour les taxis et véhicules d’activité.', price: 49000, img: 'https://images.unsplash.com/photo-1621948535605-3742ebb4451b?auto=format&fit=crop&w=900&q=85', specs: { idealFor: 'Taxi et véhicule professionnel', installation: 'Installation accompagnée', power: 'Alimentation véhicule à confirmer', connectivity: 'Réseau mobile à confirmer', tracking: 'Suivi adapté à un usage régulier', alerts: 'Paramétrage selon le modèle', sim: 'Forfait éventuel à confirmer', warranty: 'Durée à confirmer' } },
  { id: 3, kind: 'gps', name: 'Solution GPS Moto', tag: 'Moto', desc: 'Une solution adaptée aux deux-roues et à leur mobilité.', price: 29000, img: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=85', specs: { idealFor: 'Moto et deux-roues', installation: 'Montage adapté à la moto', power: 'Alimentation à confirmer', connectivity: 'Réseau mobile à confirmer', tracking: 'Consultation selon le service associé', alerts: 'Options à confirmer', sim: 'Conditions SIM à confirmer', warranty: 'Durée à confirmer' } },
  { id: 4, kind: 'gps', name: 'Pack GPS Flotte', tag: 'Entreprise', desc: 'Une base claire pour équiper plusieurs véhicules.', price: 0, img: 'https://images.unsplash.com/photo-1515569067071-ec3b51335dd0?auto=format&fit=crop&w=900&q=85', specs: { idealFor: 'Entreprise et flotte', installation: 'Déploiement planifié', power: 'Selon les véhicules', connectivity: 'À définir selon la flotte', tracking: 'Vue multi-véhicules à confirmer', alerts: 'Règles à définir avec le client', sim: 'Conditions sur devis', warranty: 'Selon les équipements retenus' } },
]

export const demoDrinks: CatalogItem[] = [
  { id: 101, kind: 'drink', name: 'Eau minérale — pack', tag: 'Pack de 6', desc: 'Format pratique pour le bureau, la maison et vos événements.', price: 3000, img: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=900&q=85' },
  { id: 102, kind: 'drink', name: 'Jus de fruits assortis', tag: 'Sélection', desc: 'Un assortiment rafraîchissant à confirmer selon les stocks.', price: 6500, img: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=900&q=85' },
  { id: 103, kind: 'drink', name: 'Boissons gazeuses', tag: 'Pack événement', desc: 'Une sélection de formats pour réceptions et événements.', price: 8500, img: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=85' },
  { id: 104, kind: 'drink', name: 'Pack fraîcheur entreprise', tag: 'Sur devis', desc: 'Une composition adaptée à vos volumes et à votre équipe.', price: 0, img: 'https://images.unsplash.com/photo-1527960471264-932f39eb5846?auto=format&fit=crop&w=900&q=85' },
]

export const demoServices: ServiceItem[] = [
  { id: 201, title: 'Technologie & IA', desc: 'Solutions numériques, automatisation et accompagnement.', icon: 'spark', tone: 'orange', audience: 'Entreprises et porteurs de projet' },
  { id: 202, title: 'Conciergerie & assistance', desc: 'Un appui fiable pour simplifier votre quotidien.', icon: 'headset', tone: 'blue', audience: 'Particuliers et professionnels' },
  { id: 203, title: 'Consulting & entreprises', desc: 'Conseil, structuration et développement d’activité.', icon: 'building', tone: 'green', audience: 'Entrepreneurs et PME' },
  { id: 204, title: 'Livraison & logistique', desc: 'Organisation, transport et suivi de vos besoins.', icon: 'truck', tone: 'yellow', audience: 'Commerces et entreprises' },
  { id: 205, title: 'Événementiel', desc: 'Organisation et coordination de vos événements.', icon: 'spark', tone: 'orange', audience: 'Particuliers et organisations' },
  { id: 206, title: 'Administration & secrétariat', desc: 'Appui documentaire et assistance administrative.', icon: 'building', tone: 'blue', audience: 'Professionnels et associations' },
]

/**
 * Front-end demo adapter. A future Payload adapter can implement this same
 * contract while keeping all catalog pages unchanged.
 */
export const demoCatalogRepository = {
  listProducts: async () => demoProducts,
  listDrinks: async () => demoDrinks,
  listServices: async () => demoServices,
  getProduct: async (id: number) => [...demoProducts, ...demoDrinks].find(item => item.id === id) ?? null,
  getService: async (id: number) => demoServices.find(item => item.id === id) ?? null,
}
