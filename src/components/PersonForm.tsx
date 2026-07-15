'use client';

import React, { useState, useEffect } from 'react';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { Entity, Person } from '../lib/db';

interface PersonFormProps {
  initialEntity?: Entity | null;
  initialPerson?: Person | null;
  onSubmit: (entityData: any, personData: any) => Promise<void>;
  onCancel: () => void;
}

export const PersonForm: React.FC<PersonFormProps> = ({
  initialEntity,
  initialPerson,
  onSubmit,
  onCancel,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [country, setCountry] = useState('Chile');
  const [city, setCity] = useState('Santiago');
  const [status, setStatus] = useState<'draft' | 'pending' | 'verified'>('verified');

  const [legalName, setLegalName] = useState('');
  const [artisticName, setArtisticName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [mainRole, setMainRole] = useState<'dancer' | 'teacher' | 'director' | 'judge' | 'guest' | 'staff' | 'other'>('dancer');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialEntity && initialPerson) {
      setDisplayName(initialEntity.display_name);
      setSlug(initialEntity.slug);
      setCountry(initialEntity.country);
      setCity(initialEntity.city);
      setStatus(initialEntity.status as any);

      setLegalName(initialPerson.legal_name || '');
      setArtisticName(initialPerson.artistic_name);
      setEmail(initialPerson.email || '');
      setPhone(initialPerson.phone || '');
      setInstagram(initialPerson.instagram || '');
      setBio(initialPerson.bio || '');
      setPhotoUrl(initialPerson.photo_url || '');
      setMainRole(initialPerson.main_role);
    }
  }, [initialEntity, initialPerson]);

  // Autogenerate slug from displayName or artisticName
  const handleArtisticNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setArtisticName(val);
    setDisplayName(val);
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
    if (!artisticName) {
      setError('El nombre artístico es obligatorio.');
      return;
    }
    if (!slug) {
      setError('El slug para la URL es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const entityData = {
      display_name: displayName || artisticName,
      slug,
      country,
      city,
      status,
      is_public: true,
    };

    const personData = {
      legal_name: legalName || null,
      artistic_name: artisticName,
      email: email || null,
      phone: phone || null,
      instagram: instagram || null,
      bio: bio || null,
      photo_url: photoUrl || null,
      main_role: mainRole,
    };

    try {
      await onSubmit(entityData, personData);
    } catch (e: any) {
      setError(e.message || 'Error al guardar el registro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const roles = [
    { value: 'dancer', label: 'Bailarina' },
    { value: 'teacher', label: 'Profesora / Directora' },
    { value: 'director', label: 'Directora de Escuela' },
    { value: 'judge', label: 'Jurado' },
    { value: 'guest', label: 'Artista Invitada' },
    { value: 'staff', label: 'Staff / Producción' },
    { value: 'other', label: 'Otro rol' },
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
          label="Nombre Artístico *"
          value={artisticName}
          onChange={handleArtisticNameChange}
          placeholder="Ej. Camila Danza"
          required
        />
        <Input
          label="Slug de URL (Único) *"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]+/g, ''))}
          placeholder="ej. camila-danza"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Nombre Legal (Privado)"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          placeholder="Ej. Camila Paz Pérez"
        />
        <Select
          label="Rol Principal *"
          options={roles}
          value={mainRole}
          onChange={(e: any) => setMainRole(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Correo Electrónico (Privado)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ejemplo@correo.com"
        />
        <Input
          label="Teléfono de Contacto (Privado)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Ej. +56987654321"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Instagram"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          placeholder="@usuario_instagram"
        />
        <Input
          label="URL de Fotografía"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://ejemplo.com/foto.jpg"
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

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-stone-700">Biografía Artística</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="w-full px-3.5 py-2 text-sm bg-white border border-stone-200 rounded-lg outline-none focus:border-[#5C061E] focus:ring-1 focus:ring-[#5C061E]"
          placeholder="Breve reseña sobre la trayectoria de la artista..."
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
