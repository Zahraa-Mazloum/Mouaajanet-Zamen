"use client";

import { useState } from "react";
import Image from "next/image";
import BgElements from "@/components/BgElements";
import { useTranslations, useLocale } from 'next-intl'


export default function AuthClientPage() {
  const [isSignIn, setIsSignIn] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const t = useTranslations('auth')
  const locale = useLocale()

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      console.log(isSignIn ? "Signed in" : "Signed up");
    } catch (err) {
      setError(`Authentication error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="relative min:min-h-screen flex items-center justify-center overflow-hidden px-4 py-28 md:py-11" >
      <BgElements />
      {/* CARD */}
      <div className="relative z-10 w-full max-w-sm sm:max-w-md md:max-w-xl lg:max-w-2xl bg-(--bgcolor) rounded-4xl sm:rounded-[40px] overflow-hidden shadow-2xl">

{/* TOP CHEESE IMAGE */}
<div className="w-full overflow-hidden max-h-30 sm:max-h-40 md:max-h-41">
  <Image
    src="/backgroundElements/Cheese.png"
    alt="Cheese Drip"
    width={800}
    height={300}
    className="w-full h-auto object-cover object-top"
  />
</div>
        {/* CONTENT */}
<div className="relative px-6 sm:px-10 md:px-12 pb-6 sm:pb-8 pt-4 sm:pt-5">
          {/* TITLE */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-(--mainheading)">
              {isSignIn ? t('welcomeBack') : t('createAccount')}
            </h1>
            <p className="text-gray-500 text-sm sm:text-base mt-1">
              {isSignIn ? t('signInToContinue') : t('signUpToStart')}
            </p>
          </div>

          {/* ERROR */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* FORM */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {!isSignIn && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('fullName')}</label>
                <input
                  type="text"
                  required={!isSignIn}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-(--primarybutton) transition text-sm sm:text-base"
                  placeholder={t('fullNamePlaceholder')}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">{t('phoneNumber')}</label>
              <input
                type="number"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-(--primarybutton) transition text-sm sm:text-base"
                placeholder={t('phonePlaceholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('password')}</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-(--primarybutton) transition text-sm sm:text-base"
                placeholder={t('passwordPlaceholder')}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-lg text-white font-medium bg-(--primarybutton) hover:bg-(--buttonhover) transition mt-1"
            >
              {isLoading
                ? isSignIn ? t('signingIn') : t('creatingAccount')
                : isSignIn ? t('signIn') : t('createBtn')}
            </button>
          </form>

          {/* TOGGLE */}
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => { setIsSignIn(!isSignIn); setError(""); setName(""); }}
              className="text-sm font-medium text-gray-600 hover:text-(--buttonhover) transition"
            >
              {isSignIn ? t('noAccount') : t('hasAccount')}
            </button>
          </div>

        </div>
      </div>
    </section>
  );
}