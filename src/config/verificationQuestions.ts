import { ItemCategory } from '../types';

export interface VerificationQuestion {
  id: string;
  question: string;
  isCrucial?: boolean;
}

export const VERIFICATION_QUESTION_BANK: Record<ItemCategory, VerificationQuestion[]> = {
  'Laptop / tablet': [
    { id: 'lt_1', question: 'What is the lock screen or desktop wallpaper?', isCrucial: true },
    { id: 'lt_2', question: 'What stickers, engravings, or marks are on the case?' },
    { id: 'lt_3', question: 'What brand and colour is the charger or protective sleeve?' },
    { id: 'lt_4', question: 'Can you unlock the device via passcode, Touch ID, or Face ID under staff observation?', isCrucial: true },
  ],
  Phone: [
    { id: 'ph_1', question: 'What is the lock screen wallpaper or notifications preview?', isCrucial: true },
    { id: 'ph_2', question: 'What specific case, cover, or cardholder is attached?' },
    { id: 'ph_3', question: 'Can you unlock the device or confirm passcode with staff supervision?', isCrucial: true },
  ],
  'Student ID / cards': [
    { id: 'id_1', question: 'Full name and student/staff ID number as shown on the card, cross-checked against university system.', isCrucial: true },
    { id: 'id_2', question: 'Can you confirm secondary photo ID or university portal login?' },
  ],
  Wallet: [
    { id: 'w_1', question: 'What specific cards, memberships, or receipts are inside?', isCrucial: true },
    { id: 'w_2', question: 'Approximate amount of cash or currency denominations present?' },
    { id: 'w_3', question: 'Any distinguishing marks, brand logo, stitching colour, or wear and tear?' },
  ],
  'Bag / backpack': [
    { id: 'bg_1', question: 'What specific contents are in the main and secondary compartments?', isCrucial: true },
    { id: 'bg_2', question: 'Any distinguishing keychains, badges, zipper tags, or tear marks?' },
    { id: 'bg_3', question: 'Specific brand name, internal pocket contents, or notebook subjects?' },
  ],
  Keys: [
    { id: 'k_1', question: 'How many keys are on the ring and what types (car fob, house, padlock)?', isCrucial: true },
    { id: 'k_2', question: 'What keychain, lanyard, or decorative fob is attached?' },
  ],
  'Headphones / earbuds': [
    { id: 'hp_1', question: 'What model/brand, serial number, or custom name appears when pairing via Bluetooth?', isCrucial: true },
    { id: 'hp_2', question: 'What protective case or lanyard covers the charging case?' },
  ],
  'Books / stationery': [
    { id: 'bk_1', question: 'What is the title/edition, or course code written inside?', isCrucial: true },
    { id: 'bk_2', question: 'Are there annotations, highlighted sections, or name tags on the pages?' },
  ],
  Clothing: [
    { id: 'cl_1', question: 'What brand, size, and specific fabric/tag details?', isCrucial: true },
    { id: 'cl_2', question: 'Any items left in the pockets or unique stains/embroidery?' },
  ],
  Other: [
    { id: 'ot_1', question: 'Where and approximately what time of day was it lost?', isCrucial: true },
    { id: 'ot_2', question: 'Any unique identifying detail, scratch, serial number, or secret mark not visible from the outside?', isCrucial: true },
  ],
};
