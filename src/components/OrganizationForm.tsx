'use client';

import React, { useState, useEffect } from 'react';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { Entity, Organization } from '../lib/db';

interface OrganizationFormProps {
  initialEntity?: Entity | null;
  initialOrg?: Organization | null;
  onSubmit: (entityData: any, orgData: any) => Promise<void>;
  onCancel: () => void;
}

export const OrganizationForm: React.FC<OrganizationFormProps> = ({
  initialEntity,
  initialOrg,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [country, setCountry] = useState('Chile');
  const [city, setCity] = useState('Santiago');
  const [status, setStatus] = useState<'draft' | 'pending' | 'verified'>('verified');

  const [orgType, setOrgType] = useState<'festival' | 'school' | 'academy' | 'company' | 'association' | 'producer' | 'community' | 'other'>('school');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialEntity && initialOrg) {
      setName(initialEntity.display_name);
      setSlug(initialEntity.slug);
      setCountry(initialEntity.country);
      setCity(initialEntity.city);
      setStatus(initialEntity.status as any);

      setOrgType(initialOrg.organization_type);
      setWebsite(initialOrg.website || '');
      setInstagram(initialOrg.instagram || '');
      setContactName(initialOrg.contact_name || '');
      setContactEmail(initialOrg.contact_email || '');
      setContactPhone(initialOrg.contact_phone || '');
    }
  }, [initialEntity, initialOrg]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!initialEntity) {
      const generatedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      setSlug(generatedSlug);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      setError('El nombre de la organización es obligatorio.');
      return;
    }
    if (!slug) {
      setError('El slug para la URL es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const entityData = {
      display_name: name,
      slug,
      country,
      city,
      status,
      is_public: true,
    };

    const orgData = {
      name,
      organization_type: orgType,
      website: website || null,
      instagram: instagram || null,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
    };

    try {
      await onSubmit(entityData, orgData);
    } catch (e: any) {
      setError(e.message || 'Error al guardar el registro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const types = [
    { value: 'school', label: 'Escuela' },
    { value: 'academy', label: 'Academia' },
    { value: 'company', label: 'Compañía' },
    { value: 'association', label: 'Asociación' },
    { value: 'producer', label: 'Productora' },
    { value: 'community', label: 'Comunidad' },
    { value: 'festival', label: 'Festival' },
    { value: 'other', label: 'Otro' },
  ];

  const statuses = [
    { value: 'verified', label: 'Verificado por FDVC' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'draft', label: 'Borrador' },
  ];

  return (
    <form onSubmit={handleFormSubmit} className="space-y-5 text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Nombre de Organización *"
          value={name}
          onChange={handleNameChange}
          placeholder="Ej. Escuela de Danza Árabe Oriente"
          required
        />
        <Input
          label="Slug de URL (Único) *"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]+/g, ''))}
          placeholder="ej. escuela-oriente"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Tipo de Organización *"
          options={types}
          value={orgType}
          onChange={(e: any) => setOrgType(e.target.value)}
        />
        <Input
          label="Instagram"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          placeholder="@escuela_instagram"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Sitio Web"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://ejemplo.com"
        />
        <Input
          label="Persona de Contacto (Privado)"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Ej. Directora María Inés"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Correo de Contacto (Privado)"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="contacto@escuela.com"
        />
        <Input
          label="Teléfono de Contacto (Privado)"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="Ej. +56988887777"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="Ciudad *"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
        />
        <Input
          label="País *"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          required
        />
        <Select
          label="Estado de Verificación *"
          options={statuses}
          value={status}
          onChange={(e: any) => setStatus(e.target.value)}
        />
      </div>

      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

      <div className="flex justify-end gap-3 pt-3 border-t border-stone-200/60">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" isLoading={isSubmitting}>
          Guardar Registro
        </Button>
      </div>
    </form>
  );
};
