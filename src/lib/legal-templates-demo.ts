import type { LegalTemplate } from '@/types'

// Starter language for the three templates, adapted from Eli's own
// fully-executed agreements (an NDA reused verbatim across multiple
// signings, a Side Artist Agreement, and standard work-for-hire grant-of-
// rights language) with names/dates/amounts swapped for fill-in brackets.
// Fully editable from the Legal → Templates tab — this is just the seed.

const now = '2026-09-04'

function clause(id: string, title: string, body: string) {
  return { id, title, body }
}

export const DEFAULT_LEGAL_TEMPLATES: LegalTemplate[] = [
  {
    id: 'tmpl-nda',
    key: 'nda',
    name: 'NDA (Confidentiality Agreement)',
    description: 'One-way confidentiality agreement for anyone gaining access to non-public information about your artist — the version your lawyer has used for every signing.',
    updatedAt: now,
    clauses: [
      clause('recitals', 'Recitals',
        `The undersigned, [RECIPIENT NAME] (hereinafter "Recipient"), will be or has been granted access to certain personal information and materials in connection with [ARTIST LEGAL NAME] professionally known as [ARTIST STAGE NAME] ("Artist") and any person or entity engaging the services of Artist, whether directly or through any entity furnishing Artist's services, including, without limitation, [ARTIST LOANOUT ENTITY 1] and [ARTIST LOANOUT ENTITY 2] (individually and collectively referred to as "Artist"). As used in this Agreement, the term "Artist" also includes any of Artist's related or affiliated entities, each of Artist's agents, employees, directors, officers, attorneys, business managers, representatives and executives, and Artist's friends, associates, and immediate and extended family members. In consideration of and as a condition of the Artist providing the Confidential Information to the Recipient, in addition to other valuable consideration, the receipt and sufficiency of which is hereby acknowledged, the parties agree as follows:`),
      clause('confidential-info', '1. Confidential Information',
        `"Confidential Information" shall mean any information, in any form or format, whether contained in written materials (including audio-visual materials) or verbally communicated, that is not intentionally disclosed by Artist to the public, and specifically includes, without limitation, (a) any information related to the personal life and/or business, legal and financial affairs of Artist; (b) any information, data, documents or other materials related to Artist, including home address(es), telephone numbers, e-mail addresses or other confidential contact information, notes, itineraries, hotel bookings, flight information, and personal or business correspondence; and (c) any characteristics, actions, behavior, views, conversations, conduct or background of Artist. Confidential Information also includes any information disclosed to Recipient or known by Recipient as a consequence of Recipient's engagement that is not publicly known about Artist's business, finances, operations, employees, policies, research, designs, services, projects, accounts, marketing, licensing, endorsements, plans, and any information defined as "Trade Secrets" under the Uniform Trade Secrets Act. Such information is confidential without regard to the manner in which or the source from which it was obtained.`),
      clause('no-use-disclose', '2. No Right to Use or Disclose Confidential Information',
        `(a) Recipient shall not, at any time (during or after Recipient's engagement with Artist), use or disclose any Confidential Information, directly or indirectly, to anyone other than Artist or persons designated by Artist. Recipient shall at all times diligently act to protect Confidential Information.\n\n(b) Unless expressly authorized by Artist in writing in each instance, Recipient shall not photograph, tape, film or otherwise record, copy or reproduce any activities of Artist or materials related to Artist. There shall be no pictures taken or recordings made of Artist or at/in connection with Artist's residence(s).\n\n(c) Recipient shall not give interviews, lectures, or speeches concerning Artist, or otherwise disclose to any third party any information concerning Artist, nor publish or cause the publication of any books, articles, or audio-visual productions concerning Artist or any Confidential Information. Recipient shall not provide any third party a copy of any master recording or audio-visual recording related to Artist, whether finished or in "demo" form.`),
      clause('ownership', '3. Ownership of Confidential Information',
        `Any and all Confidential Information — including pictures, photographs, tapes, recordings, records, documents or other materials, whether prepared by Recipient or otherwise coming into Recipient's possession — shall remain Artist's sole and exclusive property and shall not be removed, reproduced, copied or utilized without Artist's prior written consent. Recipient irrevocably assigns to Artist all right, title and interest in any such material created by Recipient to the extent Artist does not already own such rights. Recipient agrees to immediately return all Confidential Information to Artist when it is no longer required or whenever Artist requests it.\n\n[Optional carve-out: Photographs of Artist's image created by Recipient that have been previously released to the public by or with the authorization of Artist ("Non-Confidential Photos") shall not be deemed Confidential Information, and Recipient may use them solely for Recipient's bona fide promotional purposes, subject to Artist's prior written consent.]`),
      clause('remedies', '4. Remedies',
        `Recipient acknowledges that a breach of this Agreement will cause Artist irreparable harm for which Artist has no adequate remedy at law. Artist shall be entitled to injunctive relief and all other remedies available at law or equity, including all legal fees and costs incurred in enforcing this Agreement. Artist shall be entitled to recover any monies or other benefits received by Recipient in connection with any unauthorized use or dissemination of Confidential Information.`),
      clause('arbitration', '5. Binding Arbitration',
        `Any action to enforce this Agreement, or any dispute regarding it, shall be resolved by exclusive mandatory confidential arbitration before JAMS pursuant to JAMS rules and [STATE] law in [CITY, STATE], heard by a sole neutral arbitrator. The prevailing party shall be entitled to reimbursement of reasonable legal and expert fees. Notwithstanding the foregoing, Artist may seek injunctive relief in the courts of [STATE] to the extent such remedies are unavailable in arbitration.`),
      clause('waiver-severability', '6. No Waiver / Severability',
        `Artist's failure to enforce any provision of this Agreement at any time shall not be construed as a waiver of that provision. If any provision is adjudged unenforceable, the remainder of the Agreement remains in full force.`),
      clause('reporting', '7. Reporting Obligation',
        `If Recipient becomes aware of any unauthorized use or disclosure of Confidential Information, Recipient shall immediately inform Artist. Recipient shall also immediately inform Artist if anyone solicits or offers payment for, or seeks by legal process, the disclosure of any Confidential Information.`),
      clause('return', '8. Return of Confidential Information',
        `Recipient agrees to immediately return all Confidential Information, including all originals and duplicates, upon expiration or termination of Recipient's engagement with Artist, or whenever Artist otherwise requests it.`),
      clause('effective-date', '9. Effective Date',
        `This Agreement, regardless of when signed by Recipient, is deemed effective as of the date Recipient first acquires knowledge of any Confidential Information.`),
      clause('third-party', '10. Third Party Beneficiary',
        `Recipient acknowledges that Artist's related entities and individuals are third-party beneficiaries of this Agreement, and any Confidential Information Recipient acquires about such third parties is subject to the same confidentiality obligations. This right of enforcement applies only to confidentiality and does not create privity between Recipient and the third-party beneficiaries.`),
      clause('survival', '11. Survival',
        `Expiration or termination of Recipient's engagement with Artist, for any reason, shall not affect Artist's rights or Recipient's obligations under this Agreement, all of which survive such expiration or termination.`),
      clause('governing-law', '12. Governing Law',
        `This Agreement is to be construed and interpreted in accordance with the laws of the State of [STATE].`),
      clause('signature', 'Acknowledgment & Signature',
        `The undersigned acknowledges, represents and warrants that they (i) have read and fully understand this Agreement; and (ii) have had the opportunity to seek advice of legal counsel before signing and have either taken that opportunity or decided voluntarily not to do so.\n\n[RECIPIENT NAME]                    Date\nSignature of Recipient`),
    ],
  },
  {
    id: 'tmpl-split',
    key: 'split',
    name: 'Split / Side Artist Agreement',
    description: 'For a side or featured artist contributing to a master recording — sets ownership of the master, the royalty split, and the writer/composition split.',
    updatedAt: now,
    clauses: [
      clause('parties', 'Parties & Re Line',
        `[ARTIST LEGAL NAME] p/k/a [ARTIST STAGE NAME] ("we", "Company", "us", "Artist")\nc/o [ARTIST REPRESENTATIVE / LAW FIRM]\nDated: as of [DATE]\n\n[SIDE ARTIST LEGAL NAME] p/k/a [SIDE ARTIST STAGE NAME] ("Side Artist", "you" or "your")\n[SIDE ARTIST ADDRESS]\n\nRe: [ARTIST] – w – [SIDE ARTIST] : "[COMPOSITION TITLE]" – Side Artist Agreement`),
      clause('services', '1. Services',
        `Side Artist shall render non-exclusive services including recording/performance/vocal/production services in connection with the master recording ("Master") of the composition tentatively titled "[COMPOSITION TITLE] feat [SIDE ARTIST]" ("Composition"), embodying the recorded performances of Artist and Side Artist, for possible inclusion on Artist's release ("Release") and any exploitations thereof. Side Artist shall also render on-camera performance services as reasonably requested in connection with any Video embodying the Master.`),
      clause('grant-of-rights', '2. Grant of Rights',
        `For good and valuable consideration, all of Side Artist's contributions to the Master and Video shall be owned entirely, free and clear, by us as works-made-for-hire (as defined under U.S. copyright law) and, if not deemed works-made-for-hire, are hereby assigned to us in perpetuity and throughout the universe. Side Artist shall execute any assignments of copyright we may reasonably require and irrevocably appoints us as limited attorney-in-fact solely for that purpose. Side Artist grants us the exclusive right, in perpetuity throughout the universe, to edit, alter, remix, manufacture, distribute, publicly perform, broadcast, stream and otherwise exploit the Master and Video by any method now or hereafter known. No royalty or compensation is due to Side Artist other than as expressly agreed in writing between the parties. Side Artist waives any "moral rights" claims in connection with their performances as embodied in the Master and Video, and grants us the right to use their name, image, likeness and biographical information in connection with such exploitation.`),
      clause('compensation', '3. Compensation',
        `Subject to full execution of this Agreement, and provided Side Artist is not in breach hereof, we shall credit Side Artist with a royalty of [ROYALTY %]% (the "Royalty") of net record royalties (excluding mechanicals) actually received by Artist from the applicable distributor in connection with sales of the Master, payable prospectively following recoupment of costs incurred in connection with the Master and Video. The Royalty is inclusive of any session fees, union/guild payments, and any other monies due to Side Artist in connection with the Master/Video. No royalties are payable to Side Artist unless received by Artist.`),
      clause('video', '4. Video',
        `If an audio-visual work or music video of the Master is created ("Video"), Side Artist agrees to use reasonable efforts to render on-camera services subject to prior professional commitments. We are not obligated to include Side Artist's visual appearance or performance in any Video.`),
      clause('credit', '5. Credit',
        `We shall use reasonable efforts to accord Side Artist credit on records embodying the Master substantially as follows: "[COMPOSITION TITLE] featuring [SIDE ARTIST]." On streaming platforms, we shall have the right but not the obligation to name Side Artist as a "co-primary artist" and tag them as such. An inadvertent failure to accord credit shall not be a breach, provided we use reasonable efforts to correct it going forward once notified in writing. Side Artist shall not be entitled to injunctive relief for a credit failure.`),
      clause('composition-splits', '6. Composition & Writer Splits',
        `Side Artist grants Company, Artist and their licensees an irrevocable license (including a "first use" mechanical license) to reproduce and exploit any Composition(s) written or controlled, in whole or part, by Side Artist as embodied on the Master. The parties acknowledge the writer splits in connection with the Composition embodied in the Master are as follows:\n\n[SIDE ARTIST NAME]   [SPLIT %]%\n[ARTIST NAME]         [SPLIT %]%\n[ADDITIONAL WRITER]   [SPLIT %]%`),
      clause('warranties', '7. Side Artist Warranties & Indemnification',
        `Side Artist warrants that (a) they are not bound by any agreement that would prevent entering into and performing this Agreement, and have full right, power and authority to grant the rights granted herein; (b) they shall not re-record the Composition for any person or entity other than us; (c) no materials furnished by Side Artist infringe upon any third party's rights; and (d) they shall deliver all files and assets in their possession relating to the Master and Composition as reasonably required. Side Artist agrees to indemnify, defend and hold Artist harmless from any third-party claims arising from a breach of these warranties.`),
      clause('accounting', '8. Accounting / Audit',
        `Statements shall be sent on a semi-annual basis. Upon reasonable written notice, a certified CPA engaged by Side Artist may audit our books and records pertaining solely to payment of royalties hereunder, once per calendar year and only within twelve (12) months after the date of the relevant statement.`),
      clause('independent-counsel', '9. Independent Counsel',
        `SIDE ARTIST WARRANTS THAT THEY HAVE BEEN ADVISED TO OBTAIN, HAVE BEEN AFFORDED AMPLE OPPORTUNITY TO OBTAIN, AND HAVE EITHER OBTAINED THE REPRESENTATION OF INDEPENDENT COUNSEL TO EVALUATE THE TERMS OF THIS AGREEMENT, OR HAVE KNOWINGLY WAIVED THAT OPPORTUNITY.`),
      clause('misc', '10. Miscellaneous',
        `This Agreement supersedes all previous agreements relating to the subject matter and cannot be changed except by an instrument signed by all parties. We may assign this Agreement; Side Artist's services are personal and may not be assigned. No breach entitles the non-breaching party to damages unless the breaching party fails to cure within thirty (30) days of written notice. This Agreement is governed by the laws of the State of [STATE], and may be executed in counterparts, including via DocuSign or similar electronic signature. This Agreement is not binding until signed by all parties.`),
    ],
  },
  {
    id: 'tmpl-work-for-hire',
    key: 'work-for-hire',
    name: 'Work-for-Hire + NDA',
    description: 'For engineers, contributors or contractors doing paid work for an artist — assigns ownership of anything they create and binds them to confidentiality.',
    updatedAt: now,
    clauses: [
      clause('parties', 'Parties',
        `This agreement ("Agreement") dated as of [DATE] sets forth the terms between [ARTIST LEGAL NAME] p/k/a [ARTIST STAGE NAME] ("Company", "we", "us") and [CONTRIBUTOR NAME] ("Contributor", "you") in connection with [DESCRIBE WORK — e.g. mixing/production/design services] for [PROJECT/COMPOSITION TITLE] ("Project").`),
      clause('services', '1. Services',
        `Contributor shall perform the services described above in connection with the Project as customarily performed in the industry for this role, delivering all related materials and documentation reasonably required by us to perfect our rights in the resulting work product, and to timely comply with applicable law and union requirements.`),
      clause('work-for-hire', '2. Work Made for Hire / Grant of Rights',
        `All results and proceeds of Contributor's services, including any recordings, designs, written materials or other deliverables (the "Work Product"), shall be deemed "works made for hire" for Company within the meaning of the Copyright Act of 1976, as amended. If any portion of the Work Product is determined not to qualify as a work made for hire, it is automatically assigned to Company, together with all rights therein, and Contributor shall execute any documents reasonably required to confirm such assignment. Company and its designees shall have the exclusive right, throughout the universe and in perpetuity, to use, reproduce, edit, distribute and otherwise exploit the Work Product in any manner now known or hereafter developed, or to refrain from doing so.`),
      clause('compensation', '3. Compensation',
        `In full consideration for the services and rights granted herein, Company shall pay Contributor a fee of [FEE / RATE] [payable upon delivery / per the payment schedule below]. Except as expressly stated herein, no further compensation is due to Contributor in connection with the Work Product or its exploitation.`),
      clause('confidentiality', '4. Confidentiality',
        `Contributor acknowledges they will be or have been granted access to Confidential Information (as defined in the standard NDA used by Company, which is incorporated by reference) in the course of performing the services described above, and agrees not to use or disclose any such Confidential Information except as necessary to perform the services. This confidentiality obligation survives termination of this Agreement. [For a fuller confidentiality section, attach the NDA template as an exhibit.]`),
      clause('credit', '5. Credit',
        `Company shall use reasonable efforts to accord Contributor credit for their contribution substantially as follows: "[CREDIT LINE, e.g. Mixed by [NAME]]," subject to industry-standard exceptions for inadvertent omission.`),
      clause('warranties', '6. Warranties & Indemnification',
        `Contributor warrants that they have the full right and authority to enter into this Agreement and grant the rights granted herein, that the Work Product does not infringe any third party's rights, and that no materials furnished by Contributor violate any law. Contributor agrees to indemnify and hold Company harmless from any claims arising from a breach of these warranties.`),
      clause('misc', '7. Governing Law / Miscellaneous',
        `This Agreement is governed by the laws of the State of [STATE]. It supersedes all prior agreements between the parties on this subject matter and may not be modified except in writing signed by both parties. It may be executed in counterparts, including via electronic signature, and is not binding until signed by all parties.`),
    ],
  },
]
