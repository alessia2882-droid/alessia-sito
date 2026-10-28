/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { auth, db } from './lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';

// Types and Helpers kept from previous implementation
interface ImageRecord { id: string; url: string; title: string; userId: string; createdAt: string; }
enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error('Firestore Error: ', error);
  throw new Error(JSON.stringify({error: String(error), operationType, path}));
}

// Simplified image process for this context
const processImageToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => resolve(event.target?.result as string);
  });
};

const PAGES = { HOME: 'Home', FIABE: 'Le Fiabe', CHI_SONO: 'Chi sono', CONTATTI: 'Contatti' };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCMS, setShowCMS] = useState(false);
  const [currentPage, setCurrentPage] = useState(PAGES.HOME);

  // CMS state
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [imageTitle, setImageTitle] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastUploadedUrl, setLastUploadedUrl] = useState<string | null>(null);
  const [copiedGlobal, setCopiedGlobal] = useState(false);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);
  const [headerImageUrl, setHeaderImageUrl] = useState<string>("/src/assets/images/fiabe_hero_bg_1793027614896.jpg");
  const [headerMessage, setHeaderMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) fetchImages(currentUser.uid);
    });
    fetchHeaderImage();
    return () => unsubscribe();
  }, []);

  const fetchHeaderImage = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'header'));
      if (docSnap.exists() && docSnap.data().url) setHeaderImageUrl(docSnap.data().url);
    } catch (error) { console.error("Error:", error); }
  };

  const fetchImages = async (uid: string) => {
    try {
      const q = query(collection(db, 'images'), where('userId', '==', uid));
      const querySnapshot = await getDocs(q);
      const list: ImageRecord[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({ id: docSnap.id, url: data.url, title: data.title, userId: data.userId, createdAt: data.createdAt });
      });
      setImages(list);
    } catch (error) { console.error(error); }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
      setShowCMS(true);
      setCurrentPage(PAGES.HOME);
    } catch (error) { console.error("Login error:", error); } finally { setLoading(false); }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowCMS(false);
      setImages([]);
    } catch (error) { console.error("Logout error:", error); }
  };



  const handleDeleteImage = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'images', id));
      setImages((prev) => prev.filter((img) => img.id !== id));
    } catch (error) { console.error(error); }
  };

  const handleSetHeaderImage = async (url: string) => {
    try {
      await setDoc(doc(db, 'settings', 'header'), { url, updatedAt: new Date().toISOString() });
      setHeaderImageUrl(url);
      setHeaderMessage("Immagine di testata aggiornata!");
      setTimeout(() => setHeaderMessage(null), 3000);
    } catch (error) { console.error(error); }
  };

  const copyToClipboard = (url: string, cardId?: string) => {
    navigator.clipboard.writeText(url).then(() => {
        if (cardId) { setCopiedCardId(cardId); setTimeout(() => setCopiedCardId(null), 2000); }
        else { setCopiedGlobal(true); setTimeout(() => setCopiedGlobal(false), 2000); }
    });
  };

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const Navbar = () => (
    <nav className="w-full bg-slate-950 px-6 py-4 flex items-center justify-between border-b border-purple-800 sticky top-0 z-50">
      <div className="flex items-center">
        <button onClick={() => { setCurrentPage(PAGES.HOME); setIsMenuOpen(false); }} className="text-yellow-400 font-bold text-xl hover:text-white transition">
          Fiabe sotto le Stelle
        </button>
      </div>

      {/* Desktop Menu */}
      <div className="hidden md:flex items-center justify-center gap-8">
        {Object.values(PAGES).map(p => (
            <button key={p} onClick={() => setCurrentPage(p)} className="text-purple-200 hover:text-yellow-400 transition font-medium text-lg">
                {p}
            </button>
        ))}
      </div>

      {/* Mobile Toggle */}
      <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden text-white p-2">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7"/></svg>
      </button>

      {/* Auth Button (Desktop) */}
      <div className="hidden md:flex items-center justify-end gap-3">
        {loading ? <div className="w-24 h-10 bg-slate-800 animate-pulse rounded-xl"></div> : user ? (
          <button onClick={() => setShowCMS(!showCMS)} className="text-sm font-semibold bg-yellow-600 text-white px-4 py-2 rounded-xl hover:bg-yellow-500 transition">
            {showCMS ? 'Visualizza Sito' : 'CMS (Area Riservata)'}
          </button>
        ) : (
          <button onClick={handleGoogleLogin} className="bg-purple-800 hover:bg-purple-700 text-white font-medium px-5 py-2.5 rounded-xl transition text-sm">
            Area Riservata
          </button>
        )}
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-slate-900 border-b border-purple-800 p-6 flex flex-col gap-4 md:hidden">
          {Object.values(PAGES).map(p => (
            <button key={p} onClick={() => { setCurrentPage(p); setIsMenuOpen(false); }} className="text-purple-200 hover:text-yellow-400 text-lg font-medium py-2">
                {p}
            </button>
          ))}
          <hr className="border-purple-800" />
          {loading ? <div className="w-full h-10 bg-slate-800 animate-pulse rounded-xl"></div> : user ? (
            <button onClick={() => { setShowCMS(!showCMS); setIsMenuOpen(false); }} className="text-sm font-semibold bg-yellow-600 text-white px-4 py-3 rounded-xl hover:bg-yellow-500 transition w-full">
              {showCMS ? 'Visualizza Sito' : 'CMS (Area Riservata)'}
            </button>
          ) : (
            <button onClick={() => { handleGoogleLogin(); setIsMenuOpen(false); }} className="bg-purple-800 hover:bg-purple-700 text-white font-medium px-5 py-3 rounded-xl transition text-sm w-full">
              Area Riservata
            </button>
          )}
        </div>
      )}
    </nav>
  );

  const Home = () => (
    <div className="text-center py-20 bg-slate-950 text-white min-h-[60vh] flex flex-col items-center justify-center">
      <h1 className="text-6xl font-extrabold tracking-tight text-white mb-4 drop-shadow-[0_2px_10px_rgba(255,255,255,0.3)]">Fiabe sotto le Stelle</h1>
      <p className="text-2xl text-purple-200 mb-8 italic">Storie della buonanotte per piccoli sognatori</p>
      <button onClick={() => setCurrentPage(PAGES.FIABE)} className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold py-3 px-8 rounded-full text-lg shadow-lg shadow-yellow-500/20 transition">
        Ascolta una fiaba
      </button>
    </div>
  );

  const FiabeGrid = () => {
    const fiabe = [
        {title: "Cenerentola", duration: "10 min", img: "https://via.placeholder.com/400x250?text=Cenerentola"},
        {title: "Peter Pan", duration: "12 min", img: "https://via.placeholder.com/400x250?text=Peter+Pan"},
        {title: "Cappuccetto Rosso", duration: "8 min", img: "https://via.placeholder.com/400x250?text=Cappuccetto+Rosso"},
        {title: "Il Gatto con gli Stivali", duration: "11 min", img: "https://via.placeholder.com/400x250?text=Gatto+Stivali"},
        {title: "Biancaneve", duration: "15 min", img: "https://via.placeholder.com/400x250?text=Biancaneve"},
        {title: "Pinocchio", duration: "14 min", img: "https://via.placeholder.com/400x250?text=Pinocchio"},
    ];
    return (
        <div className="bg-slate-950 min-h-screen py-16 px-6">
            <h2 className="text-4xl font-bold text-center text-white mb-12">Le nostre Fiabe</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                {fiabe.map((f, i) => (
                    <div key={i} className="bg-slate-900 border border-purple-800 p-4 rounded-2xl shadow-xl">
                        <img src={f.img} alt={f.title} className="w-full h-48 object-cover rounded-xl mb-4" />
                        <h3 className="text-xl font-semibold text-yellow-400">{f.title}</h3>
                        <p className="text-purple-300 text-sm mb-4">Durata: {f.duration}</p>
                        <a href="https://www.youtube.com" className="block text-center bg-purple-800 text-white py-2 rounded-lg hover:bg-purple-700 transition">Guarda su YouTube</a>
                    </div>
                ))}
            </div>
        </div>
    );
  };

  const ChiSono = () => (
    <div className="bg-slate-950 min-h-screen py-20 px-6 text-center text-white">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-8">
            <img src="/public/assets/aistudio/immagine_sito_bc9abccb.jpeg" alt="Ritratto illustrato di Alessia" className="w-64 h-64 object-cover rounded-2xl shadow-2xl border-4 border-yellow-500" />
            <div className="space-y-6 text-lg text-purple-100 text-left">
                <h2 className="text-4xl font-bold text-yellow-400">Chi sono</h2>
                <p>Ho sempre amato le storie fin da bambina, mi hanno accompagnato in mille avventure tra sogno e realtà.</p>
                <p>Ho dedicato i miei studi a imparare come trasmettere la conoscenza e il piacere di apprendere, e oggi ho scelto di raccogliere le fiabe più belle per raccontarle a te, per accompagnare dolcemente i tuoi sogni e aiutarti ad addormentarti con serenità.</p>
            </div>
        </div>
    </div>
  );

  const Contatti = () => (
    <div className="bg-slate-950 min-h-screen py-20 px-6 text-white">
        <h2 className="text-4xl font-bold text-center text-yellow-400 mb-12">Contatti</h2>
        <p className="text-center text-purple-200 mb-8">Hai una fiaba preferita o una richiesta speciale? Scrivimi, sarò felice di trasformarla in una storia della buonanotte.</p>
        <form className="max-w-md mx-auto space-y-4 bg-slate-900 p-8 rounded-2xl border border-purple-800">
            <input type="text" placeholder="Nome" className="w-full p-3 rounded-xl bg-slate-950 border border-purple-700 text-white" />
            <input type="email" placeholder="Email" className="w-full p-3 rounded-xl bg-slate-950 border border-purple-700 text-white" />
            <textarea placeholder="Messaggio" className="w-full p-3 rounded-xl bg-slate-950 border border-purple-700 text-white h-32"></textarea>
            <button className="w-full bg-yellow-500 text-slate-950 font-bold py-3 rounded-xl hover:bg-yellow-400 transition">Invia</button>
        </form>
    </div>
  );

  const handleImageUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageFile || !user) return;
    setUploading(true);
    try {
      const dataUrl = await processImageToDataUrl(imageFile);
      const newRecord = { url: dataUrl, title: imageTitle || imageFile.name, userId: user.uid, createdAt: new Date().toISOString() };
      const docRef = await addDoc(collection(db, 'images'), newRecord);
      setImages((prev) => [{ id: docRef.id, ...newRecord }, ...prev]);
      setLastUploadedUrl(dataUrl);
      setImageTitle('');
      setImageFile(null);
    } catch (error) { console.error(error); } finally { setUploading(false); }
  };

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100 font-sans">
      <Navbar />
      
      {user && showCMS ? (
        <div className="max-w-5xl mx-auto px-6 py-12 text-slate-900 bg-white min-h-screen">
            <h1 className="text-3xl font-bold mb-8">Gestione CMS - Carica Fiaba</h1>
            <form onSubmit={handleImageUpload} className="bg-slate-100 p-6 rounded-2xl space-y-4 mb-8">
              <input type="text" placeholder="Titolo Fiaba" value={imageTitle} onChange={(e) => setImageTitle(e.target.value)} className="w-full p-2 border rounded" />
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="w-full" />
              <button type="submit" disabled={uploading} className="bg-purple-800 text-white p-2 rounded hover:bg-purple-700 transition">
                {uploading ? 'Caricamento...' : 'Carica su Firebase'}
              </button>
            </form>
            {lastUploadedUrl && (
              <div className="mt-4 p-4 bg-green-100 border rounded text-sm text-green-800">
                <p className="mb-2">URL Immagine:</p>
                <input type="text" readOnly value={lastUploadedUrl} className="w-full p-2 mb-2 border rounded select-all" />
                <button onClick={() => navigator.clipboard.writeText(lastUploadedUrl)} className="bg-purple-800 text-white px-4 py-2 rounded">Copia URL</button>
              </div>
            )}
        </div>
      ) : (
        <>
            {/* Header Image */}
            <div className="w-full relative overflow-hidden h-[40vh] md:h-[60vh]">
                <img src={headerImageUrl} alt="Cielo Stellato" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-slate-950/40"></div>
            </div>
            
            {/* Pages Content */}
            {currentPage === PAGES.HOME && <Home />}
            {currentPage === PAGES.FIABE && <FiabeGrid />}
            {currentPage === PAGES.CHI_SONO && <ChiSono />}
            {currentPage === PAGES.CONTATTI && <Contatti />}
        </>
      )}
    </div>
  );
}
