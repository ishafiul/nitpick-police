import { DartAstChunker } from './dart-ast-chunker';
import { ChunkingOptions } from '../../types/chunking';

describe('DartAstChunker', () => {
  let chunker: DartAstChunker;
  let mockOptions: ChunkingOptions;

  beforeEach(() => {
    chunker = new DartAstChunker();
    mockOptions = {
      maxChunkSize: 100,
      overlapLines: 5,
      minChunkSize: 10,
    };
  });

  describe('getSupportedLanguages', () => {
    it('should return dart as supported language', () => {
      const languages = chunker.getSupportedLanguages();
      expect(languages).toEqual(['dart']);
    });
  });

  describe('getStrategyName', () => {
    it('should return correct strategy name', () => {
      const name = chunker.getStrategyName();
      expect(name).toBe('dart-ast-based');
    });
  });

  describe('chunk', () => {
    it('should parse simple Dart class', async () => {
      const dartCode = `
        class User {
          final String name;
          final int age;

          User(this.name, this.age);

          void greet() {
            print('Hello, \$name!');
          }

          String toString() {
            return 'User(name: \$name, age: \$age)';
          }
        }
      `;

      const filePath = '/test/user.dart';
      const chunks = await chunker.chunk(dartCode, filePath, mockOptions);

      expect(chunks.length).toBeGreaterThan(0);
      const firstChunk = chunks[0];
      if (firstChunk) {
        expect(firstChunk.language).toBe('dart');
        expect(firstChunk.chunkType).toBe('class');
        expect(firstChunk.complexityScore).toBeGreaterThan(0);
      }
    });

    it('should parse Dart function', async () => {
      const dartCode = `
        Future<String> fetchUserData(int userId) async {
          final response = await http.get(Uri.parse('/api/users/\$userId'));
          if (response.statusCode == 200) {
            return response.body;
          } else {
            throw Exception('Failed to load user data');
          }
        }
      `;

      const filePath = '/test/api.dart';
      const chunks = await chunker.chunk(dartCode, filePath, mockOptions);

      expect(chunks.length).toBeGreaterThan(0);
      const functionChunk = chunks.find(chunk => chunk.chunkType === 'function');
      expect(functionChunk).toBeDefined();
      expect(functionChunk?.complexityScore).toBeGreaterThan(1);
    });

    it('should parse import statements', async () => {
      const dartCode = `
        import 'dart:convert';
        import 'package:http/http.dart' as http;
        import 'package:my_app/models/user.dart';

        void main() {
          print('Hello World');
        }
      `;

      const filePath = '/test/main.dart';
      const chunks = await chunker.chunk(dartCode, filePath, mockOptions);

      expect(chunks.length).toBeGreaterThan(0);
      const moduleChunk = chunks.find(chunk => chunk.chunkType === 'module');
      expect(moduleChunk).toBeDefined();
      expect(moduleChunk?.dependencies).toContain('dart:convert');
      expect(moduleChunk?.dependencies).toContain('package:http/http.dart');
    });

    it('should parse enum definitions', async () => {
      const dartCode = `
        enum UserRole {
          admin,
          moderator,
          user,
          guest
        }

        class User {
          final UserRole role;

          User(this.role);
        }
      `;

      const filePath = '/test/enums.dart';
      const chunks = await chunker.chunk(dartCode, filePath, mockOptions);

      expect(chunks.length).toBeGreaterThan(0);
      const enumChunk = chunks.find(chunk => chunk.chunkType === 'enum');
      expect(enumChunk).toBeDefined();
      expect(enumChunk?.complexityScore).toBe(4); 
    });

    it('should handle complex class hierarchies', async () => {
      const dartCode = `
        abstract class Animal {
          String name;

          Animal(this.name);

          void makeSound();
        }

        class Dog extends Animal {
          Dog(String name) : super(name);

          @override
          void makeSound() {
            print('Woof!');
          }

          void fetch() {
            print('\$name is fetching the ball');
          }
        }
      `;

      const filePath = '/test/animals.dart';
      const chunks = await chunker.chunk(dartCode, filePath, mockOptions);

      expect(chunks.length).toBeGreaterThan(0);
      const classChunks = chunks.filter(chunk => chunk.chunkType === 'class');
      expect(classChunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract dependencies correctly', async () => {
      const dartCode = `
        import 'dart:io';
        import 'package:flutter/material.dart';

        class MyWidget extends StatelessWidget {
          final String title;

          const MyWidget({Key? key, required this.title}) : super(key: key);

          @override
          Widget build(BuildContext context) {
            return Scaffold(
              appBar: AppBar(title: Text(title)),
              body: Center(child: Text('Hello World')),
            );
          }
        }
      `;

      const filePath = '/test/widget.dart';
      const chunks = await chunker.chunk(dartCode, filePath, mockOptions);

      const classChunk = chunks.find(chunk => chunk.chunkType === 'class');
      expect(classChunk).toBeDefined();
      expect(classChunk?.dependencies).toContain('StatelessWidget');
    });

    it('should handle malformed code gracefully', async () => {
      const malformedCode = `
        class Incomplete {
          
          void method() {
            print('hello');
          }
        
      `;

      const filePath = '/test/malformed.dart';
      const chunks = await chunker.chunk(malformedCode, filePath, mockOptions);

      expect(chunks).toBeDefined();
    });

    it('should respect configuration options', async () => {
      const customChunker = new DartAstChunker({
        prioritizeClasses: false,
        prioritizeFunctions: true,
        minFunctionSize: 20, 
      });

      const dartCode = `
        class TestClass {
          void shortMethod() {
            print('short');
          }
        }
      `;

      const filePath = '/test/config.dart';
      const chunks = await customChunker.chunk(dartCode, filePath, mockOptions);

      expect(chunks).toBeDefined();
    });
  });
});
