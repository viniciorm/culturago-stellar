'use client';

import React, { useState, useEffect } from 'react';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { Entity, Provider } from '../lib/db';

interface ProviderFormProps {
  initialEntity?: Entity | null;
  initialProvider?: Provider | null;
  onSubmit: (entityData: any, providerData: any) => Promise<void>;
  onCancel: () => void;
}

export const ProviderForm: React.FC<ProviderFormProps> = ({
  initialEntity,
  initialProvider,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [country, setCountry] = useState('Chile');
  const [city, setCity] = useState('Santiago');
  const [status, setStatus] = useState<'draft' | 'pending' | 'verified'>('verified');

  const [providerType, setProviderType] = useState<string>('photographer');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [website, setWebsite] = useState('');
  const [publicDescription, setPublicDescription] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialEntity && initialProvider) {
      setName(initialEntity.display_name);
      setSlug(initialEntity.slug);
      setCountry(initialEntity.country);
      setCity(initialEntity.city);
      setStatus(initialEntity.status as any);

      setProviderType(initialProvider.provider_type);
      setContactName(initialProvider.contact_name || '');
      setEmail(initialProvider.email || '');
      setPhone(initialProvider.phone || '');
      setInstagram(initialProvider.instagram || '');
      setWebsite(initialProvider.website || '');
      setPublicDescription(initialProvider.public_description || '');
    }
  }, [initialEntity, initialProvider]);

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
      setError('El nombre de proveedor es obligatorio.');
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

    const providerData = {
      name,
      provider_type: providerType,
      contact_name: contactName || null,
      email: email || null,
      phone: phone || null,
      instagram: instagram || null,
      website: website || null,
      public_description: publicDescription || null,
    };

    try {
      await onSubmit(entityData, providerData);
    } catch (e: any) {
      setError(e.message || 'Error al guardar el registro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const types = [
    { value: 'photographer', label: 'Fotografía' },
    { value: 'videographer', label: 'Filmación / Video' },
    { value: 'venue', label: 'Sede / Teatro' },
    { value: 'pub', label: 'Restaurante / Pub de Gala' },
    { value: 'foodtruck', label: 'Comida / Foodtruck' },
    { value: 'sound', label: 'Sonido / Sonidista' },
    { value: 'lighting', label: 'Iluminación' },
    { value: 'sponsor', label: 'Auspiciador / Patrocinador' },
    { value: 'streaming', label: 'Transmisión en Vivo' },
    { value: 'makeup', label: 'Maquillaje / Estilismo' },
    { value: 'costume', label: 'Indumentaria / Vestuario' },
    { value: 'ticketing', label: 'Boletería / Entradas' },
    { value: 'transport', label: 'Transporte / Logística' },
    { value: 'security', label: 'Seguridad' },
    { value: 'other', label: 'Otros servicios' },
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
          label="Nombre Comercial *"
          value={name}
          onChange={handleNameChange}
          placeholder="Ej. Sonido Profesional Ñuñoa"
          required
        />
        <Input
          label="Slug de URL (Único) *"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]+/g, ''))}
          placeholder="ej. sonido-nunoa"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Tipo de Proveedor *"
          options={types}
          value={providerType}
          onChange={(e: any) => setProviderType(e.target.value)}
        />
        <Input
          label="Instagram"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          placeholder="@proveedor_instagram"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Persona de Contacto"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Ej. Juan Pérez"
        />
        <Input
          label="Sitio Web"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://ejemplo.com"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Correo de Contacto"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contacto@proveedor.com"
        />
        <Input
          label="Teléfono de Contacto"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Ej. +56999990000"
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
        <label className="text-xs font-semibold text-stone-700">Descripción del Servicio</label>
        <textarea
          value={publicDescription}
          onChange={(e) => setPublicDescription(e.target.value)}
          rows={3}
          className="w-full px-3.5 py-2 text-sm bg-white border border-stone-200 rounded-lg outline-none focus:border-[#5C061E] focus:ring-1 focus:ring-[#5C061E]"
          placeholder="Describe los servicios que provee para el festival..."
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
