
import AudioTeacher from "@/components/AudioTeacher";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white py-12 px-4">
      <div className="container mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-blue-700 mb-2">English Teacher AI</h1>
          <p className="text-lg text-gray-600">Luyện nói tiếng Anh với giáo viên AI 24/7</p>
        </header>
        
        <main>
          <AudioTeacher />
        </main>
        
        <footer className="mt-10 text-center text-gray-500 text-sm">
          <p>© 2025 English Teacher AI - Học tiếng Anh mọi lúc, mọi nơi</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
