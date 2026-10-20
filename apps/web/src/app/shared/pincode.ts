/** India Post's postal regions, by the first digit of a pincode. */
const ZONES: Record<string, string> = {
  '1': 'Delhi, Haryana, Punjab, Himachal, J&K and Chandigarh',
  '2': 'Uttar Pradesh and Uttarakhand',
  '3': 'Rajasthan and Gujarat',
  '4': 'Maharashtra, Madhya Pradesh, Chhattisgarh and Goa',
  '5': 'Andhra Pradesh, Telangana and Karnataka',
  '6': 'Tamil Nadu and Kerala',
  '7': 'West Bengal, Odisha and the North East',
  '8': 'Bihar and Jharkhand',
  '9': 'Army postal service',
};

export function postalZone(pincode: string): string | null {
  return /^[1-9]\d{5}$/.test(pincode) ? ZONES[pincode[0]] : null;
}
