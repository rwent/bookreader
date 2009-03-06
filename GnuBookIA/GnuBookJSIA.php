<?
/*
Copyright(c)2008 Internet Archive. Software license AGPL version 3.

This file is part of GnuBook.

    GnuBook is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    GnuBook is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with GnuBook.  If not, see <http://www.gnu.org/licenses/>.
*/

$id = $_REQUEST['id'];
$itemPath = $_REQUEST['itemPath'];
$server = $_REQUEST['server']; 

if ("" == $id) {
    GBFatal("No identifier specified!");
}

if ("" == $itemPath) {
    GBFatal("No itemPath specified!");
}

if ("" == $server) {
    GBFatal("No server specified!");
}


if (!preg_match("|^/[0-3]/items/{$id}$|", $itemPath)) {
    GBFatal("Bad id!");
}

$imageFormat = 'unknown';
$zipFile = "$itemPath/{$id}_jp2.zip";
if (file_exists($zipFile)) {
    $imageFormat = 'jp2';
} else {
  $zipFile = "$itemPath/${id}_tif.zip";
  if (file_exists($zipFile)) {
    $imageFormat = 'tif';
  }
}

if ("unknown" == $imageFormat) {
  GBfatal("Unknown image format");
}

$scanDataFile = "$itemPath/{$id}_scandata.xml";
$scanDataZip  = "$itemPath/scandata.zip";
if (file_exists($scanDataFile)) {
    $scanData = simplexml_load_file($scanDataFile);
} else if (file_exists($scanDataZip)) {
    $cmd  = 'unzip -p ' . escapeshellarg($scanDataZip) . ' scandata.xml';
    exec($cmd, $output, $retval);
    if ($retval != 0) GBFatal("Could not unzip ScanData!");
    
    $dump = join("\n", $output);
    $scanData = simplexml_load_string($dump);
} else if (file_exists("$itemPath/scandata.xml")) {
    // For e.g. Scribe v.0 books!
    $scanData = simplexml_load_file("$itemPath/scandata.xml");
} else {
    GBFatal("ScanData file not found!");
}

$metaDataFile = "$itemPath/{$id}_meta.xml";
if (!file_exists($metaDataFile)) {
    GBFatal("MetaData file not found!");
}


$metaData = simplexml_load_file($metaDataFile);

//$firstLeaf = $scanData->pageData->page[0]['leafNum'];
?>

gb = new GnuBook();

gb.getPageWidth = function(index) {
    //return parseInt(this.pageW[index]/this.reduce);
    return this.pageW[index];
}

gb.getPageHeight = function(index) {
    //return parseInt(this.pageH[index]/this.reduce);
    return this.pageH[index];
}

gb.getPageURI = function(index) {
    var leafStr = '0000';            
    var imgStr = this.leafMap[index].toString();
    var re = new RegExp("0{"+imgStr.length+"}$");

    if (1==this.mode) {
        var url = 'http://'+this.server+'/GnuBook/GnuBookImages.php?zip='+this.zip+'&file='+this.bookId+'_'+this.imageFormat+'/'+this.bookId+'_'+leafStr.replace(re, imgStr) + '.'+this.imageFormat+'&scale='+this.reduce;
    } else {
        var ratio = this.getPageHeight(index) / this.twoPageH;
        var scale;
        // $$$ we make an assumption here that the scales are available pow2 (like kakadu)
        if (ratio <= 2) {
            scale = 1;
        } else if (ratio <= 4) {
            scale = 2;
        } else {
            scale = 4;
        }        
    
        //var url = 'http://'+this.server+'/GnuBook/GnuBookImages.php?zip='+this.zip+'&file='+this.bookId+'_jp2/'+this.bookId+'_'+leafStr.replace(re, imgStr) + '.jp2&height='+this.twoPageH+'&origHeight='+this.getPageHeight(index);
        var url = 'http://'+this.server+'/GnuBook/GnuBookImages.php?zip='+this.zip+'&file='+this.bookId+'_'+this.imageFormat+'/'+this.bookId+'_'+leafStr.replace(re, imgStr) + '.'+this.imageFormat+'&scale='+scale;
        
    }
    return url;
}

gb.getPageSide = function(index) {
    //assume the book starts with a cover (right-hand leaf)
    //we should really get handside from scandata.xml
    
    // $$$ we should get this from scandata instead of assuming the accessible
    //     leafs are contiguous
    if ('rl' != this.pageProgression) {
        // If pageProgression is not set RTL we assume it is LTR
        if (0 == (index & 0x1)) {
            // Even-numbered page
            return 'R';
        } else {
            // Odd-numbered page
            return 'L';
        }
    } else {
        // RTL
        if (0 == (index & 0x1)) {
            return 'L';
        } else {
            return 'R';
        }
    }
}

gb.getPageNum = function(index) {
    return this.pageNums[index];
}

gb.leafNumToIndex = function(leafNum) {
    var index = jQuery.inArray(leafNum, this.leafMap);
    if (-1 == index) {
        return null;
    } else {
        return index;
    }
}

// This function returns the left and right indices for the user-visible
// spread that contains the given index.  The return values may be
// null if there is no facing page or the index is invalid.
gb.getSpreadIndices = function(pindex) {
    // $$$ we could make a separate function for the RTL case and
    //      only bind it if necessary instead of always checking
    // $$$ we currently assume there are no gaps
    
    var spreadIndices = [null, null]; 
    if ('rl' == this.pageProgression) {
        // Right to Left
        if (this.getPageSide(pindex) == 'R') {
            spreadIndices[1] = pindex;
            spreadIndices[0] = pindex + 1;
        } else {
            // Given index was LHS
            spreadIndices[0] = pindex;
            spreadIndices[1] = pindex - 1;
        }
    } else {
        // Left to right
        if (this.getPageSide(pindex) == 'L') {
            spreadIndices[0] = pindex;
            spreadIndices[1] = pindex + 1;
        } else {
            // Given index was RHS
            spreadIndices[1] = pindex;
            spreadIndices[0] = pindex - 1;
        }
    }
    
    //console.log("   index %d mapped to spread %d,%d", pindex, spreadIndices[0], spreadIndices[1]);
    
    return spreadIndices;
}

gb.pageW =		[
            <?
            $i=0;
            foreach ($scanData->pageData->page as $page) {
                if (shouldAddPage($page)) {
                    if(0 != $i) echo ",";   //stupid IE
                    echo "{$page->cropBox->w}";
                    $i++;
                }
            }
            ?>
            ];

gb.pageH =		[
            <?
            $totalHeight = 0;
            $i=0;            
            foreach ($scanData->pageData->page as $page) {
                if (shouldAddPage($page)) {
                    if(0 != $i) echo ",";   //stupid IE                
                    echo "{$page->cropBox->h}";
                    $totalHeight += intval($page->cropBox->h/4) + 10;
                    $i++;
                }
            }
            ?>
            ];
gb.leafMap = [
            <?
            $i=0;
            foreach ($scanData->pageData->page as $page) {
                if (shouldAddPage($page)) {
                    if(0 != $i) echo ",";   //stupid IE
                    echo "{$page['leafNum']}";
                    $i++;
                }
            }
            ?>    
            ];

gb.pageNums = [
            <?
            $i=0;
            foreach ($scanData->pageData->page as $page) {
                if (shouldAddPage($page)) {
                    if(0 != $i) echo ",";   //stupid IE                
                    if (array_key_exists('pageNumber', $page) && ('' != $page->pageNumber)) {
                        echo "'{$page->pageNumber}'";
                    } else {
                        echo "null";
                    }
                    $i++;
                }
            }
            ?>    
            ];
            
<?
/* Output title leaf if marked */
$titleLeaf = '';
foreach ($scanData->pageData->page as $page) {
    if (("Title Page" == $page->pageType) || ("Title" == $page->pageType)) {
        $titleLeaf = "{$page['leafNum']}";
        break;
    }
}
    
if ('' != $titleLeaf) {
    printf("gb.titleLeaf = %d;\n", $titleLeaf);
}
?>
      
gb.numLeafs = gb.pageW.length;

gb.bookId   = '<?echo $id;?>';
gb.zip      = '<?echo $zipFile;?>';
gb.server   = '<?echo $server;?>';
gb.bookTitle= '<?echo preg_replace("/\'/", "\\'", $metaData->title);?>';
gb.bookPath = '<?echo $itemPath;?>';
gb.bookUrl  = '<?echo "http://www.archive.org/details/$id";?>';
gb.imageFormat = '<?echo $imageFormat;?>';
<?

# Load some values from meta.xml
if ('' != $metaData->{'page-progression'}) {
  echo "gb.pageProgression = '" . $metaData->{"page-progression"} . "';";
} else {
  // Assume page progression is Left To Right
  echo "gb.pageProgression = 'lr';";
}

# Special cases
if ('bandersnatchhsye00scarrich' == $id) {
    echo "gb.mode     = 2;\n";
    echo "gb.auto     = true;\n";
}

?>


// Check for config object
if (typeof(gbConfig) != 'undefined') {
    if (gbConfig['mode'] == 1) {
      gb.mode = 1;
    } else if (gbConfig['mode'] == 2) {
      gb.mode = 2;
      
      //$$$mang hack to override request for 2up for RTL until we have full RTL support
      //        we need a better way to determine the mode and pass config options
      //if ((typeof(gb.pageProgression) != 'undefined') && (gb.pageProgression == 'rl')) {
      //  gb.mode = 1;
      //}
  
    }
}

gb.init();

<?


function GBFatal($string) {
    echo "alert('$string')\n";
    die(-1);
}

// Returns true if a page should be added based on it's information in
// the metadata
function shouldAddPage($page) {
    // Return false only if the page is marked addToAccessFormats false.
    // If there is no assertion we assume it should be added.
    if (isset($page->addToAccessFormats)) {
        if ("false" == strtolower(trim($page->addToAccessFormats))) {
            return false;
        }
    }
    
    return true;
}

?>