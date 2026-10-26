/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { auth, db } from './lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';

interface ImageRecord {
  id: string;
  url: string;
  title: string;
  userId: string;
  createdAt: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Convert and compress image to base64 Data URL for direct database storage
const processImageToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const DEFAULT_HEADER_IMAGE = "/assets/aistudio/Paste_October_21__2026_-_12_13PM_c533039b";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCMS, setShowCMS] = useState(false);

  // CMS state
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [imageTitle, setImageTitle] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastUploadedUrl, setLastUploadedUrl] = useState<string | null>(null);
  const [copiedGlobal, setCopiedGlobal] = useState(false);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);
  const [headerImageUrl, setHeaderImageUrl] = useState<string>(DEFAULT_HEADER_IMAGE);
  const [headerMessage, setHeaderMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        fetchImages(currentUser.uid);
      }
    });
    fetchHeaderImage();
    return () => unsubscribe();
  }, []);

  const fetchHeaderImage = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'header'));
      if (docSnap.exists() && docSnap.data().url) {
        setHeaderImageUrl(docSnap.data().url);
      }
    } catch (error) {
      console.error("Error fetching header image:", error);
    }
  };

  const fetchImages = async (uid: string) => {
    const path = 'images';
    try {
      const q = query(collection(db, path), where('userId', '==', uid));
      const querySnapshot = await getDocs(q);
      const list: ImageRecord[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          url: data.url,
          title: data.title,
          userId: data.userId,
          createdAt: data.createdAt,
        });
      });
      setImages(list);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
      setShowCMS(true);
    } catch (error) {
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowCMS(false);
      setImages([]);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleImageUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageFile || !user) return;

    setUploading(true);
    setLastUploadedUrl(null);
    const path = 'images';

    try {
      const dataUrl = await processImageToDataUrl(imageFile);
      const newRecord = {
        url: dataUrl,
        title: imageTitle || imageFile.name,
        userId: user.uid,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, path), newRecord);

      setImages((prev) => [
        {
          id: docRef.id,
          ...newRecord,
        },
        ...prev,
      ]);

      setLastUploadedUrl(dataUrl);
      setImageTitle('');
      setImageFile(null);
      const fileInput = document.getElementById('imageFileInput') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (id: string) => {
    const path = `images/${id}`;
    try {
      await deleteDoc(doc(db, 'images', id));
      setImages((prev) => prev.filter((img) => img.id !== id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSetHeaderImage = async (url: string) => {
    if (!user) {
      alert("Devi effettuare il login per impostare l'immagine di testata.");
      return;
    }
    const path = 'settings/header';
    try {
      await setDoc(doc(db, 'settings', 'header'), { url, updatedAt: new Date().toISOString() });
      setHeaderImageUrl(url);
      setHeaderMessage("Immagine di testata aggiornata con successo!");
      setTimeout(() => setHeaderMessage(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const copyToClipboard = (url: string, cardId?: string) => {
    const fallbackCopy = (text: string) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          triggerSuccess(cardId);
        }
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    };

    const triggerSuccess = (cId?: string) => {
      if (cId) {
        setCopiedCardId(cId);
        setTimeout(() => setCopiedCardId(null), 2000);
      } else {
        setCopiedGlobal(true);
        setTimeout(() => setCopiedGlobal(false), 2000);
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        triggerSuccess(cardId);
      }).catch(() => {
        fallbackCopy(url);
      });
    } else {
      fallbackCopy(url);
    }
  };

  return (
    <div className="bg-white min-h-screen relative text-gray-900">
      {/* Main Content / CMS View when logged in & showCMS is true */}
      {user && showCMS ? (
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-100">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">CMS - Gestione Immagini</h1>
              <p className="text-gray-500 text-sm mt-1">Carica immagini, copia i loro URL o impostale direttamente come immagine di testata del sito.</p>
            </div>
            <button
              onClick={() => setShowCMS(false)}
              className="text-sm font-medium text-gray-600 bg-gray-100 px-4 py-2 rounded-xl hover:bg-gray-200 transition"
            >
              Torna al Sito
            </button>
          </div>

          {headerMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 text-sm font-medium rounded-xl">
              {headerMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Upload Form */}
            <div className="md:col-span-1 bg-gray-50 p-6 rounded-2xl border border-gray-200/80 shadow-xs h-fit">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Carica Nuova Immagine</h2>
              <form onSubmit={handleImageUpload} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Titolo Immagine</label>
                  <input
                    type="text"
                    value={imageTitle}
                    onChange={(e) => setImageTitle(e.target.value)}
                    placeholder="Es. Banner Principale"
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">File Immagine</label>
                  <input
                    id="imageFileInput"
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && setImageFile(e.target.files[0])}
                    required
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-gray-900 file:text-white hover:file:bg-gray-800"
                  />
                </div>
                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 px-4 rounded-xl transition text-sm shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Salvataggio su database...</span>
                    </>
                  ) : (
                    'Salva su Firebase'
                  )}
                </button>
              </form>

              {lastUploadedUrl && (
                <div className="mt-6 p-4 bg-white rounded-xl border border-green-200">
                  <p className="text-xs font-semibold text-green-700 uppercase mb-1">URL Immagine Caricata:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={lastUploadedUrl}
                      className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-600 select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(lastUploadedUrl)}
                      className="px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 shrink-0"
                    >
                      {copiedGlobal ? 'Copiato!' : 'Copia'}
                    </button>
                  </div>
                  <button
                    onClick={() => handleSetHeaderImage(lastUploadedUrl)}
                    className="mt-3 w-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-3 rounded-lg transition"
                  >
                    Imposta come Testata del Sito
                  </button>
                </div>
              )}
            </div>

            {/* Uploaded Images List */}
            <div className="md:col-span-2 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Immagini Caricate ({images.length})</h2>
              {images.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                  <p className="text-sm text-gray-500">Nessuna immagine caricata nel database.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {images.map((img) => (
                    <div key={img.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                      <div>
                        <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden mb-3">
                          <img src={img.url} alt={img.title} className="w-full h-full object-cover" />
                        </div>
                        <h3 className="font-semibold text-sm text-gray-900 truncate">{img.title}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(img.createdAt).toLocaleDateString()}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => copyToClipboard(img.url, img.id)}
                            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition"
                          >
                            {copiedCardId === img.id ? 'Copiato!' : 'Copia URL'}
                          </button>
                          <button
                            onClick={() => handleDeleteImage(img.id)}
                            className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1.5"
                          >
                            Elimina
                          </button>
                        </div>
                        <button
                          onClick={() => handleSetHeaderImage(img.url)}
                          className="w-full text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold py-1.5 px-3 rounded-lg transition border border-emerald-200"
                        >
                          Imposta come Testata
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* Header Image / Immagine di testata */}
          <div className="w-full relative overflow-hidden h-[40vh] md:h-[60vh] lg:h-[70vh]">
            <img
              src={headerImageUrl}
              alt="Immagine di testata"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40"></div>
            
            {/* Top Right "Area Riservata" Button - Positioned over header image */}
            <div className="absolute top-6 right-6 z-50">
              {loading ? (
                <div className="w-24 h-10 bg-white/20 animate-pulse rounded-xl"></div>
              ) : user ? (
                <div className="flex items-center gap-3 bg-white/90 border border-gray-200 px-4 py-2 rounded-2xl shadow-sm">
                  {user.photoURL && (
                    <img src={user.photoURL} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
                  )}
                  <span className="text-sm font-medium text-gray-700 hidden sm:inline">{user.email}</span>
                  <button
                    onClick={() => setShowCMS(!showCMS)}
                    className="text-xs font-semibold bg-gray-900 text-white px-3.5 py-2 rounded-xl hover:bg-gray-800 transition shadow-sm"
                  >
                    {showCMS ? 'Visualizza Sito' : 'CMS (Area Riservata)'}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="text-xs font-medium text-red-600 hover:text-red-700 ml-1"
                  >
                    Esci
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  className="bg-white/90 hover:bg-white text-gray-900 font-medium px-5 py-2.5 rounded-xl shadow-sm transition text-sm flex items-center gap-2"
                >
                  Area Riservata
                </button>
              )}
            </div>
          </div>

          {/* Navigation Menu (moved below header) */}
          <nav className="w-full bg-white px-6 py-4 grid grid-cols-3 items-center border-b border-gray-100">
            <div className="flex items-center">
              <button onClick={() => setShowCMS(false)} className="text-gray-900 font-bold text-lg hover:text-gray-600 transition">
                Home
              </button>
            </div>
            
            <div className="flex items-center justify-center gap-8">
              <a href="#" className="text-gray-700 hover:text-gray-900 transition">Chi sono</a>
              <a href="#" className="text-gray-700 hover:text-gray-900 transition">Gallery</a>
              <a href="#" className="text-gray-700 hover:text-gray-900 transition">Contatti</a>
            </div>
            
            <div className="flex items-center justify-end">
                {/* Empty div for grid alignment */}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
