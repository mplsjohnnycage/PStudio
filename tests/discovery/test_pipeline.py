import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools'/'discovery'))
from pipeline import *
class DiscoveryTests(unittest.TestCase):
 def test_domain(self):
  self.assertEqual(normalize_domain('HTTPS://WWW.Example.COM/path'),'example.com')
  self.assertIsNone(normalize_domain(''))
 def test_stable_identity(self):
  self.assertEqual(identity_key({'source':'overture','source_id':'abc'}),'overture:abc')
  self.assertEqual(identity_key({'name':'A B','city':'M'}),identity_key({'name':'A-B','city':'M'}))
 def test_missing_site_not_no_site(self):
  self.assertEqual(website_status(None)['status'],'unknown')
  self.assertEqual(website_status('example.com')['status'],'unverified_candidates')
  self.assertEqual(website_status('example.com',confirmed_official='example.com')['status'],'verified_site')
 def test_gate_missing_not_negative(self):
  self.assertEqual(gate_a({'category_fit':1})['decision'],'research_more')
  self.assertEqual(gate_a({'category_fit':1,'observed_digital_gap':1,'identity_confidence':1})['decision'],'advance')
  self.assertEqual(gate_a({'category_fit':0,'observed_digital_gap':0,'identity_confidence':1})['decision'],'defer')
 def test_gate_validation(self):
  with self.assertRaises(ValueError): gate_a({'category_fit':2})
 def test_seed_query(self):
  q,p=duckdb_seed_query('/tmp/places/*.parquet',category_pattern='%plumb%')
  self.assertEqual(p,['%plumb%',1000]);self.assertIn('read_parquet',q)
  with self.assertRaises(ValueError):duckdb_seed_query("/tmp/x' OR 1=1",category_pattern='%')
 def test_export(self):
  self.assertEqual(len(export_jsonl([{'name':'Acme'}]).splitlines()),1)
if __name__=='__main__':unittest.main()
