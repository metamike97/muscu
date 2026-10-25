# Génère data/exercises_slim.json : la bibliothèque sans images ni instructions.
import json
src = json.load(open('data/exercises.json'))
keep = ['id','name','level','force','mechanic','equipment','category','primaryMuscles','secondaryMuscles']
slim = [{k: e.get(k) for k in keep} for e in src]
json.dump(slim, open('data/exercises_slim.json','w'), ensure_ascii=False, separators=(',',':'))
print(len(slim), 'exercices écrits')
