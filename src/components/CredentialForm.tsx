'use client';

import React, { useState, useEffect } from 'react';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { Entity, Credential, db } from '../lib/db';

interface CredentialFormProps {
  entities: Entity[];
  onSubmit: (credentialData: any) => Promise<void>;
  onCancel: () => void;
}

export const CredentialForm: React.FC<CredentialFormProps> = ({
  entities,
  onSubmit,
  onCancel,
}) => {
  const [credentialCode, setCredentialCode] = useState('');
  const [issuerId, setIssuerId] = useState('11111111-1111-1111-1111-111111111111'); // Default FDVC Org
  const [subjectId, setSubjectId] = useState('');
  const [credentialType, setCredentialType] = useState('dancer_participant');
  const [title, setTitle] = useState('Bailarina Participante FDVC 2026');
  const [description, setDescription] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auto-generate credential code and title based on type and subject
  useEffect(() => {
    const codePrefix = {
      dancer_participant: 'DCR',
      school_participant: 'SCH',
      teacher_director: 'TCH',
      official_photographer: 'PHO',
      official_videographer: 'VID',
      venue_sponsor: 'SPO',
    }[credentialType] || 'GEN';

    const selectedSubject = entities.find(e => e.id === subjectId);
    const subjectNamePart = selectedSubject 
      ? selectedSubject.display_name.toUpperCase().substring(0, 4).replace(/[^A-Z0-9]/g, '')
      : 'DEMO';

    const randomSuffix = Math.floor(100 + Math.random() * 900);
    setCredentialCode(`CRED-FDVC26-${codePrefix}-${subjectNamePart}-${randomSuffix}`);

    const defaultTitles: Record<string, string> = {
      dancer_participant: 'Bailarina Participante FDVC 2026',
      school_participant: 'Escuela Participante FDVC 2026',
      teacher_director: 'Profesora / Directora FDVC 2026',
      official_photographer: 'Fotógrafo Oficial FDVC 2026',
      official_videographer: 'Camarógrafo Oficial FDVC 2026',
      venue_sponsor: 'Auspiciador / Aliado Cultural FDVC 2026',
    };
    setTitle(defaultTitles[credentialType] || 'Credencial CulturaGO');

    const defaultDescriptions: Record<string, string> = {
      dancer_participant: 'Acreditación oficial que certifica la participación de la bailarina solista en las muestras artísticas de FDVC 2026.',
      school_participant: 'Acreditación oficial que certifica la participación de la escuela en las galas del Festival Nacional Danza del Vientre Chile 2026.',
      teacher_director: 'Acreditación oficial de la labor docente y dirección artística de la academia en el marco de FDVC 2026.',
      official_photographer: 'Acreditación de prensa y cobertura fotográfica autorizada para capturar las presentaciones del festival.',
      official_videographer: 'Acreditación de prensa y cobertura de video/audiovisual autorizada en el escenario del festival.',
      venue_sponsor: 'Acreditación de patrocinio, colaboración y alianza cultural oficial con el Festival Nacional Danza del Vientre Chile 2026.',
    };
    setDescription(defaultDescriptions[credentialType] || '');

  }, [credentialType, subjectId, entities]);

  // Set default subject on mount
  useEffect(() => {
    const subjects = entities.filter(e => e.id !== issuerId);
    if (subjects.length > 0 && !subjectId) {
      setSubjectId(subjects[0].id);
    }
  }, [entities, issuerId, subjectId]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) {
      setError('Debes seleccionar un sujeto (destinatario) para la credencial.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const credentialData = {
      credential_code: credentialCode,
      issuer_entity_id: issuerId,
      subject_entity_id: subjectId,
      event_id: '22222222-2222-2222-2222-333333333333', // FDVC 2026 Event
      credential_type: credentialType,
      title,
      description: description || null,
      status: 'issued' as const,
      issued_at: new Date().toISOString(),
    };

    try {
      await onSubmit(credentialData);
    } catch (e: any) {
      setError(e.message || 'Error al emitir la credencial.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const types = [
    { value: 'dancer_participant', label: 'Bailarina Participante' },
    { value: 'school_participant', label: 'Escuela Participante' },
    { value: 'teacher_director', label: 'Profesora / Directora' },
    { value: 'official_photographer', label: 'Fotógrafo Oficial' },
    { value: 'official_videographer', label: 'Camarógrafo Oficial' },
    { value: 'venue_sponsor', label: 'Auspiciador / Aliado Cultural' },
  ];

  const issuers = entities
    .filter(e => e.type === 'organization')
    .map(e => ({ value: e.id, label: e.display_name }));

  const subjects = entities
    .filter(e => e.id !== issuerId) // Don't issue to self
    .map(e => ({ value: e.id, label: `${e.display_name} (${e.type === 'person' ? 'Persona' : e.type === 'organization' ? 'Escuela' : 'Proveedor'})` }));

  return (
    <form onSubmit={handleFormSubmit} className="space-y-5 text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Emisor de la Credencial (Organización) *"
          options={issuers}
          value={issuerId}
          onChange={(e: any) => setIssuerId(e.target.value)}
        />
        <Select
          label="Destinatario de la Credencial (Sujeto) *"
          options={subjects}
          value={subjectId}
          onChange={(e: any) => setSubjectId(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Tipo de Acreditación *"
          options={types}
          value={credentialType}
          onChange={(e: any) => setCredentialType(e.target.value)}
        />
        <Input
          label="Código de Credencial (Autogenerado)"
          value={credentialCode}
          onChange={(e) => setCredentialCode(e.target.value)}
          required
        />
      </div>

      <Input
        label="Título de la Credencial *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ej. Bailarina Solista Invitada"
        required
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-stone-700">Descripción / Derechos de la Credencial</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3.5 py-2 text-sm bg-white border border-stone-200 rounded-lg outline-none focus:border-[#5C061E] focus:ring-1 focus:ring-[#5C061E]"
          placeholder="Ej. Acreditación que otorga libre acceso a camarines y salas de ensayo..."
        />
      </div>

      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

      <div className="flex justify-end gap-3 pt-3 border-t border-[#C5A880]/30">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" isLoading={isSubmitting}>
          Emitir Credencial Verificable
        </Button>
      </div>
    </form>
  );
};
