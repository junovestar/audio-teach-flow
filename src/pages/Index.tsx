
import AudioTeacher from "@/components/AudioTeacher";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white py-12 px-4">
      <div className="container mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-teacher-dark mb-2">Audio Teach Flow</h1>
          <p className="text-lg text-gray-600">Trao đổi tiếng Anh thời gian thực với giáo viên AI</p>
        </header>
        
        <main>
          <AudioTeacher />
        </main>
        
        <footer className="mt-10 text-center text-gray-500 text-sm">
          <p>© 2025 Audio Teach Flow</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
